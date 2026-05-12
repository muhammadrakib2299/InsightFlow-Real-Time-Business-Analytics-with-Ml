import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { ForecastService } from './forecast.service';

class ForecastQueryDto {
  @IsString()
  @MaxLength(64)
  metric!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  horizon_days?: number;

  @IsString()
  @IsIn(['prophet', 'arima'])
  @IsOptional()
  model_kind?: 'prophet' | 'arima';
}

interface WorkspaceRequest extends Request {
  workspace: { id: string; role: 'owner' | 'member' | 'viewer' };
}

@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller('workspaces/:workspaceId/forecast')
export class ForecastController {
  constructor(private readonly forecast: ForecastService) {}

  @Get()
  async get(@Req() req: WorkspaceRequest, @Query() q: ForecastQueryDto) {
    return this.forecast.forecast(
      req.workspace.id,
      q.metric,
      q.horizon_days ?? 30,
      q.model_kind,
    );
  }

  @Get('models')
  async models(@Req() req: WorkspaceRequest) {
    return this.forecast.listModels(req.workspace.id);
  }
}
