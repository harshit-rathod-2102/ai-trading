import { IsSessionDate } from '../market-data.validation';
import { ApiProperty } from '@nestjs/swagger';

export class DateRangeDto {
  @ApiProperty({ example: '2026-09-01', description: 'First NSE session date (YYYY-MM-DD)' })
  @IsSessionDate()
  from!: string;

  @ApiProperty({ example: '2026-09-19', description: 'Last NSE session date (YYYY-MM-DD)' })
  @IsSessionDate()
  to!: string;
}
