import { IsSessionDate } from '../market-data.validation';

export class DateRangeDto {
  @IsSessionDate() from!: string;
  @IsSessionDate() to!: string;
}
