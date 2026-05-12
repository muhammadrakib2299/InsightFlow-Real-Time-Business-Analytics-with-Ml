import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { PdfService } from './pdf.service';

interface WorkspaceRequest extends Request {
  workspace: { id: string; role: 'owner' | 'member' | 'viewer' };
}

@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller('workspaces/:workspaceId/dashboards/:dashboardId/pdf')
export class PdfController {
  constructor(
    private readonly pdf: PdfService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Post()
  async enqueue(
    @Req() req: WorkspaceRequest,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(req.workspace.id, user.id, ['owner', 'member']);
    return this.pdf.enqueue(req.workspace.id, dashboardId, user.id);
  }

  @Get(':jobId')
  async status(
    @Req() req: WorkspaceRequest,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.pdf.get(req.workspace.id, jobId);
  }

  @Get(':jobId/download')
  async download(
    @Req() req: WorkspaceRequest,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    const url = await this.pdf.download(req.workspace.id, jobId);
    return { url, expiresIn: 3600 };
  }
}
