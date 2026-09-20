import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
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
    const chunkSize = 500;
    await this.instruments.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Instrument);
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
