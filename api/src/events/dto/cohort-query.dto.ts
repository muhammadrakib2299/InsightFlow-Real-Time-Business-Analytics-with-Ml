import { IsDateString } from 'class-validator';

export class CohortQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
