import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

export class AnalyticsRangeDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Inclusive start trading date using Asia/Kolkata semantics',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-20',
    description: 'Inclusive end trading date using Asia/Kolkata semantics',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string;
}
