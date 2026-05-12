import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { DashboardsService } from './dashboards.service';
import { CreateDashboardDto, UpdateDashboardDto } from './dto/dashboard.dto';

interface WorkspaceRequest extends Request {
  workspace: { id: string; role: 'owner' | 'member' | 'viewer' };
}

@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller('workspaces/:workspaceId/dashboards')
export class DashboardsController {
  constructor(
    private readonly dashboards: DashboardsService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get()
  async list(@Req() req: WorkspaceRequest) {
    return this.dashboards.list(req.workspace.id);
  }

  @Get(':dashboardId')
  async get(
    @Req() req: WorkspaceRequest,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
  ) {
    return this.dashboards.get(req.workspace.id, dashboardId);
  }

  @Post()
  async create(
    @Req() req: WorkspaceRequest,
    @Body() dto: CreateDashboardDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner', 'member']);
    return this.dashboards.create(req.workspace.id, user.id, dto);
  }

  @Patch(':dashboardId')
  async update(
    @Req() req: WorkspaceRequest,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Body() dto: UpdateDashboardDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner', 'member']);
    return this.dashboards.update(req.workspace.id, dashboardId, dto);
  }

  @Delete(':dashboardId')
  async delete(
    @Req() req: WorkspaceRequest,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner']);
    return this.dashboards.delete(req.workspace.id, dashboardId);
  }
}
