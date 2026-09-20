import { IsInt, Max, Min } from 'class-validator';
import { IsPrice } from '../../common/utils/price';

export class BuyCandidateDto {
  @IsPrice()
  actualEntry!: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;
}
