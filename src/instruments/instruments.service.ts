import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { Instrument } from './entities/instrument.entity';
import { Universe } from './entities/universe.entity';
import { UniverseMembership } from './entities/universe-membership.entity';
import { CreateInstrumentDto, CreateUniverseDto, ListInstrumentsDto } from './dto/instrument.dto';
import { ProviderInstrument } from '../providers/market-data/models/provider-instrument';

@Injectable()
export class InstrumentsService {
  constructor(
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    @InjectRepository(Universe) private readonly universes: Repository<Universe>,
    @InjectRepository(UniverseMembership)
    private readonly memberships: Repository<UniverseMembership>,
  ) {}

  async create(input: CreateInstrumentDto): Promise<Instrument> {
    const instrument = this.instruments.create({
      ...input,
      id: randomUUID(),
      isActive: true,
      sector: input.sector ?? null,
      industry: input.industry ?? null,
    });
    try {
      return await this.instruments.save(instrument);
    } catch (error: unknown) {
      if (this.isDuplicate(error))
        throw new ConflictException('Instrument already exists for exchange and symbol');
      throw error;
    }
  }

  list(filters: ListInstrumentsDto = {}): Promise<Instrument[]> {
    const query = this.instruments.createQueryBuilder('instrument');
    if (filters.symbol) query.andWhere('instrument.symbol = :symbol', { symbol: filters.symbol });
    if (filters.exchange)
      query.andWhere('instrument.exchange = :exchange', { exchange: filters.exchange });
    if (filters.type) query.andWhere('instrument.type = :type', { type: filters.type });
    if (filters.active !== undefined)
      query.andWhere('instrument.isActive = :active', { active: filters.active === 'true' });
    if (filters.universe) {
      query.innerJoin(
        UniverseMembership,
        'membership',
        'membership.instrumentId = instrument.id AND membership.universeCode = :universe',
        { universe: filters.universe },
      );
    }
    return query
      .orderBy('instrument.exchange', 'ASC')
      .addOrderBy('instrument.symbol', 'ASC')
      .getMany();
  }

  async get(id: string): Promise<Instrument> {
    const instrument = await this.instruments.findOneBy({ id });
    if (!instrument) throw new NotFoundException('Instrument not found');
    return instrument;
  }

  async findActiveByMarketIdentity(symbol: string, exchange: string): Promise<Instrument> {
    const instrument = await this.instruments.findOneBy({ symbol, exchange, isActive: true });
    if (!instrument)
      throw new NotFoundException(`Active instrument not found for ${exchange}:${symbol}`);
    return instrument;
  }

  async setActivity(id: string, isActive: boolean): Promise<Instrument> {
    const result = await this.instruments.update(id, { isActive });
    if (!result.affected) throw new NotFoundException('Instrument not found');
    return this.get(id);
  }

  async syncProviderCatalog(
    provider: string,
    catalog: readonly ProviderInstrument[],
  ): Promise<{ provider: string; discovered: number; upserted: number }> {
    const catalogByProviderIdentity = this.indexCatalogByProviderIdentity(provider, catalog);
    const chunkSize = 500;
    await this.instruments.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Instrument);
      await this.applyProviderIdentityRenames(repository, provider, catalogByProviderIdentity);
      for (let offset = 0; offset < catalog.length; offset += chunkSize) {
        const values = catalog.slice(offset, offset + chunkSize).map((item) =>
          repository.create({
            id: randomUUID(),
            symbol: item.symbol,
            exchange: item.exchange,
            name: item.name,
            type: item.instrumentType,
            sector: item.sector,
            industry: item.industry,
            provider,
            providerInstrumentId: item.providerInstrumentId,
            providerSymbol: item.providerSymbol,
            providerMetadata: shallowMetadata(item.metadata),
            isActive: true,
          }),
        );
        await repository
          .createQueryBuilder()
          .insert()
          .values(values)
          .orUpdate(
            [
              'name',
              'type',
              'sector',
              'industry',
              'provider',
              'provider_instrument_id',
              'provider_symbol',
              'provider_metadata',
              'updated_at',
            ],
            ['exchange', 'symbol'],
          )
          .execute();
      }
    });
    return { provider, discovered: catalog.length, upserted: catalog.length };
  }

  /**
   * Provider instrument keys are stable across an exchange-symbol rename. Move the existing local
   * record to the provider's current market identity before the symbol-based catalog upsert runs.
   */
  private async applyProviderIdentityRenames(
    repository: Repository<Instrument>,
    provider: string,
    catalogByProviderIdentity: ReadonlyMap<string, ProviderInstrument>,
  ): Promise<void> {
    if (catalogByProviderIdentity.size === 0) return;
    const providerInstrumentIds = [...catalogByProviderIdentity.keys()];
    const storedInstruments = await repository.findBy({
      provider,
      providerInstrumentId: In(providerInstrumentIds),
    });
    for (const stored of storedInstruments) {
      const incoming = catalogByProviderIdentity.get(stored.providerInstrumentId!);
      if (
        !incoming ||
        (stored.exchange === incoming.exchange && stored.symbol === incoming.symbol)
      ) {
        continue;
      }
      const target = await repository.findOneBy({
        exchange: incoming.exchange,
        symbol: incoming.symbol,
      });
      if (target && target.id !== stored.id) {
        throw new ConflictException(
          `Provider identity ${provider}:${incoming.providerInstrumentId} cannot be moved to ${incoming.exchange}:${incoming.symbol}; that market identity is already assigned to another instrument`,
        );
      }
      await repository.update(stored.id, {
        exchange: incoming.exchange,
        symbol: incoming.symbol,
      });
    }
  }

  private indexCatalogByProviderIdentity(
    provider: string,
    catalog: readonly ProviderInstrument[],
  ): ReadonlyMap<string, ProviderInstrument> {
    const indexed = new Map<string, ProviderInstrument>();
    for (const instrument of catalog) {
      const previous = indexed.get(instrument.providerInstrumentId);
      if (
        previous &&
        (previous.exchange !== instrument.exchange || previous.symbol !== instrument.symbol)
      ) {
        throw new ConflictException(
          `Provider catalog contains conflicting market identities for ${provider}:${instrument.providerInstrumentId}`,
        );
      }
      indexed.set(instrument.providerInstrumentId, instrument);
    }
    return indexed;
  }

  async createUniverse(input: CreateUniverseDto): Promise<Universe> {
    try {
      // insert avoids overwriting an existing universe when the same code is submitted.
      await this.universes.insert(input);
      return this.getUniverse(input.code);
    } catch (error: unknown) {
      if (this.isDuplicate(error)) throw new ConflictException('Universe already exists');
      throw error;
    }
  }

  listUniverses(): Promise<Universe[]> {
    return this.universes.find({ order: { code: 'ASC' } });
  }

  async getUniverse(code: string): Promise<Universe> {
    const universe = await this.universes.findOneBy({ code });
    if (!universe) throw new NotFoundException('Universe not found');
    return universe;
  }

  async addMember(code: string, instrumentId: string): Promise<UniverseMembership> {
    await this.getUniverse(code);
    await this.get(instrumentId);
    await this.memberships
      .createQueryBuilder()
      .insert()
      .values({ universeCode: code, instrumentId })
      .orIgnore()
      .execute();
    return this.memberships.findOneByOrFail({ universeCode: code, instrumentId });
  }

  async replaceMembers(
    code: string,
    instrumentIds: readonly string[],
  ): Promise<{ universeCode: string; memberCount: number }> {
    const uniqueIds = [...new Set(instrumentIds)];
    return this.instruments.manager.transaction(async (manager) => {
      const universe = await manager.getRepository(Universe).findOne({
        where: { code },
        lock: { mode: 'pessimistic_write' },
      });
      if (!universe) throw new NotFoundException('Universe not found');

      const instruments = await manager.getRepository(Instrument).findBy({ id: In(uniqueIds) });
      if (instruments.length !== uniqueIds.length)
        throw new NotFoundException('One or more instruments were not found');

      const memberships = manager.getRepository(UniverseMembership);
      await memberships.delete({ universeCode: code });
      await memberships
        .createQueryBuilder()
        .insert()
        .values(uniqueIds.map((instrumentId) => ({ universeCode: code, instrumentId })))
        .execute();
      return { universeCode: code, memberCount: uniqueIds.length };
    });
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'driverError' in error &&
      typeof error.driverError === 'object' &&
      error.driverError !== null &&
      'code' in error.driverError &&
      error.driverError.code === '23505'
    );
  }
}

function shallowMetadata(
  metadata: ProviderInstrument['metadata'],
): Record<string, string | number | boolean | null> | null {
  if (!metadata) return null;
  const entries = Object.entries(metadata).filter(
    (entry): entry is [string, string | number | boolean | null] =>
      entry[1] === null || ['string', 'number', 'boolean'].includes(typeof entry[1]),
  );
  return Object.fromEntries(entries);
}
