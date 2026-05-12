import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { KpiQueryDto } from './dto/kpi-query.dto';
import { EventsService } from './events.service';
import { METRICS } from './metrics';

interface WorkspaceRequest extends Request {
  workspace: { id: string; role: 'owner' | 'member' | 'viewer' };
}

@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller('workspaces/:workspaceId/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('metrics')
  metrics() {
    return Object.entries(METRICS).map(([key, def]) => ({
      key,
      label: def.label,
      event_name: def.eventName,
      agg: def.agg,
      currency: def.currency ?? null,
    }));
  }

  @Get('kpi')
  async kpi(@Req() req: WorkspaceRequest, @Query() q: KpiQueryDto) {
    return this.events.kpi(req.workspace.id, q.metric, q.from, q.to, q.granularity ?? 'day');
  }
}
