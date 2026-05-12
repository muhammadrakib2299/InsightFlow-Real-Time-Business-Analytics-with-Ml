import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class KpiQueryDto {
  @IsString()
  @MaxLength(64)
  metric!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsString()
  @IsIn(['hour', 'day'])
  @IsOptional()
  granularity?: 'hour' | 'day';
}
