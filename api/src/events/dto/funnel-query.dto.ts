import { IsArray, IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FunnelQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  /**
   * Comma-separated ordered list of event_names making up the funnel
   * (e.g. `signup,subscription_started,subscription_payment`). We
   * accept this as a single string rather than repeating ?step= so the
   * URL stays cacheable and the query stays bounded.
   */
  @IsString()
  @MaxLength(512)
  steps!: string;

  /** Window in hours within which the user must complete the funnel. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  windowHours?: number;
}
