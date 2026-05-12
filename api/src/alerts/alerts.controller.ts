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
import { AlertsService } from './alerts.service';
import { CreateAlertDto, UpdateAlertDto } from './dto/alert.dto';

interface WorkspaceRequest extends Request {
  workspace: { id: string; role: 'owner' | 'member' | 'viewer' };
}

@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller('workspaces/:workspaceId/alerts')
export class AlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get()
  async list(@Req() req: WorkspaceRequest) {
    return this.alerts.list(req.workspace.id);
  }

  @Get('history')
  async history(@Req() req: WorkspaceRequest) {
    return this.alerts.history(req.workspace.id);
  }

  @Get(':id')
  async get(@Req() req: WorkspaceRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.alerts.get(req.workspace.id, id);
  }

  @Post()
  async create(
    @Req() req: WorkspaceRequest,
    @Body() dto: CreateAlertDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner', 'member']);
    return this.alerts.create(req.workspace.id, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: WorkspaceRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner', 'member']);
    return this.alerts.update(req.workspace.id, id, dto);
  }

  @Delete(':id')
  async delete(
    @Req() req: WorkspaceRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner']);
    return this.alerts.delete(req.workspace.id, id);
  }
}
