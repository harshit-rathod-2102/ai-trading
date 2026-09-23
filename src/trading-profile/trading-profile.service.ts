import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { validateSync } from 'class-validator';
import Decimal from 'decimal.js';
import { TradingProfile } from './entities/trading-profile.entity';
import { UpsertTradingProfileDto } from './dto/upsert-trading-profile.dto';

@Injectable()
export class TradingProfileService {
  private readonly logger = new Logger(TradingProfileService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getActiveProfile(): Promise<TradingProfile> {
    const profile = await this.dataSource
      .getRepository(TradingProfile)
      .findOneBy({ isActive: true });
    if (!profile) throw new NotFoundException('Trading profile is not configured');
    return profile;
  }

  async upsertActiveProfile(input: UpsertTradingProfileDto): Promise<TradingProfile> {
    const validated = Object.assign(new UpsertTradingProfileDto(), input);
    const errors = validateSync(validated, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
    if (new Decimal(validated.riskPerTradePercent).gt(validated.maxOpenPortfolioRiskPercent)) {
      throw new BadRequestException(
        'riskPerTradePercent must not exceed maxOpenPortfolioRiskPercent',
      );
    }
    const outcome = await this.dataSource.transaction(async (manager) => {
      // Serializes even concurrent first-time PUTs, when no profile row exists to lock.
      // This table is tiny and updates are infrequent personal settings operations.
      await manager.query('LOCK TABLE trading_profiles IN SHARE ROW EXCLUSIVE MODE');
      const repository = manager.getRepository(TradingProfile);
      const current = await repository.findOneBy({ isActive: true });
      const profile = repository.create({
        ...validated,
        name: validated.name.trim(),
        id: current?.id ?? randomUUID(),
        isActive: true,
      });
      if (current) {
        await repository.update(current.id, profile);
      } else {
        await repository.insert(profile);
      }
      return {
        profile: await repository.findOneByOrFail({ id: profile.id }),
        created: !current,
      };
    });
    this.logger.log(
      {
        event: outcome.created ? 'trading_profile.created' : 'trading_profile.updated',
        module: TradingProfileService.name,
        operation: 'upsertActiveProfile',
        tradingProfileId: outcome.profile.id,
        status: 'active',
      },
      outcome.created ? 'Trading profile created' : 'Trading profile updated',
    );
    return outcome.profile;
  }
}
