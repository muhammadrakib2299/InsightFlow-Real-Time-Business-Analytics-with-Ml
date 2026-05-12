import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDashboardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}

export class UpdateDashboardDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @IsOptional()
  layout?: Array<{ i: string; x: number; y: number; w: number; h: number }>;
}
