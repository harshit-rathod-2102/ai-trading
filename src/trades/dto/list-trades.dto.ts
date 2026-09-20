import { IsEnum, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { TradeStatus } from '../../common/enums/trade-status.enum';

export class ListTradesDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(TradeStatus)
  status?: TradeStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9&._-]*$/)
  @MaxLength(32)
  symbol?: string;
}
