import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsPrice } from '../../common/utils/price';

export class BuyCandidateDto {
  @ApiProperty({ example: '2920.0000', description: 'Actual manually executed entry price' })
  @IsPrice()
  actualEntry!: string;

  @ApiProperty({ example: 20, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;
}
