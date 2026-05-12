import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ShareService } from './share.service';

interface WorkspaceRequest extends Request {
  workspace: { id: string; role: 'owner' | 'member' | 'viewer' };
}

class CreateShareLinkDto {
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(60 * 60 * 24 * 365)
  @IsOptional()
  ttlSeconds?: number;
}

@Controller()
export class ShareController {
  constructor(
    private readonly share: ShareService,
    private readonly workspaces: WorkspacesService,
  ) {}

  // --- authenticated routes for owners managing share links ---

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('workspaces/:workspaceId/dashboards/:dashboardId/share-links')
  async list(@Req() req: WorkspaceRequest) {
    return this.share.list(req.workspace.id);
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('workspaces/:workspaceId/dashboards/:dashboardId/share-links')
  async create(
    @Req() req: WorkspaceRequest,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Body() dto: CreateShareLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner']);
    return this.share.create(req.workspace.id, dashboardId, user.id, dto.ttlSeconds);
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Delete('workspaces/:workspaceId/share-links/:linkId')
  async revoke(
    @Req() req: WorkspaceRequest,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner']);
    return this.share.revoke(req.workspace.id, linkId);
  }

  // --- public route consumed by the share page (no JWT) ---

  @Get('share/:token')
  async resolve(@Param('token') token: string) {
    if (!token || token.length > 4096) {
      throw new BadRequestException('missing or oversized token');
    }
    const { workspaceId, dashboardId } = await this.share.verify(token);
    const dashboard = await this.share.readDashboard(workspaceId, dashboardId);
    return { dashboard, mode: 'shared' as const };
  }
}
