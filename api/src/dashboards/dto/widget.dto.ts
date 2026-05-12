import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const WIDGET_TYPES = ['kpi', 'line', 'bar', 'funnel', 'cohort', 'forecast', 'table'] as const;
export type WidgetTypeName = (typeof WIDGET_TYPES)[number];

export class CreateWidgetDto {
  @IsString()
  @IsIn(WIDGET_TYPES as unknown as string[])
  type!: WidgetTypeName;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(64)
  @IsOptional()
  positionX?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(256)
  @IsOptional()
  positionY?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  width?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  height?: number;
}

export class UpdateWidgetDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(64)
  @IsOptional()
  positionX?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(256)
  @IsOptional()
  positionY?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  width?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  height?: number;
}
