import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AlertChannelDto {
  @IsString()
  @IsIn(['email', 'slack', 'webhook'])
  type!: 'email' | 'slack' | 'webhook';

  @IsObject()
  config!: Record<string, unknown>;
}

export class CreateAlertDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(64)
  metric!: string;

  @IsString()
  @IsIn(['zscore', 'iqr', 'threshold'])
  method!: 'zscore' | 'iqr' | 'threshold';

  @IsObject()
  thresholdParams!: Record<string, unknown>;

  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => AlertChannelDto)
  channels!: AlertChannelDto[];

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  @IsOptional()
  cooldownSeconds?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateAlertDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsObject()
  @IsOptional()
  thresholdParams?: Record<string, unknown>;

  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => AlertChannelDto)
  @IsOptional()
  channels?: AlertChannelDto[];

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  @IsOptional()
  cooldownSeconds?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
