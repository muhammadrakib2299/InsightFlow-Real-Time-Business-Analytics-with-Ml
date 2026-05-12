import {
  Body,
  Controller,
  Delete,
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
import { CreateWidgetDto, UpdateWidgetDto } from './dto/widget.dto';
import { WidgetsService } from './widgets.service';

interface WorkspaceRequest extends Request {
  workspace: { id: string; role: 'owner' | 'member' | 'viewer' };
}

@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller('workspaces/:workspaceId/dashboards/:dashboardId/widgets')
export class WidgetsController {
  constructor(
    private readonly widgets: WidgetsService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Post()
  async create(
    @Req() req: WorkspaceRequest,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Body() dto: CreateWidgetDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner', 'member']);
    return this.widgets.create(req.workspace.id, dashboardId, dto);
  }

  @Patch(':widgetId')
  async update(
    @Req() req: WorkspaceRequest,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @Body() dto: UpdateWidgetDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner', 'member']);
    return this.widgets.update(req.workspace.id, dashboardId, widgetId, dto);
  }

  @Delete(':widgetId')
  async delete(
    @Req() req: WorkspaceRequest,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner', 'member']);
    return this.widgets.delete(req.workspace.id, dashboardId, widgetId);
  }
}
