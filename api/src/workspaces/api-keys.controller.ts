import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { ApiKeysService } from './api-keys.service';
import { WorkspacesService } from './workspaces.service';

class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(8)
  @IsOptional()
  scopes?: string[];
}

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/api-keys')
export class ApiKeysController {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get()
  async list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(workspaceId, user.id, ['owner', 'member']);
    return this.keys.list(workspaceId);
  }

  @Post()
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(workspaceId, user.id, ['owner']);
    const issued = await this.keys.issue(workspaceId, user.id, dto.name, dto.scopes);
    return {
      ...issued,
      // Surface the warning prominently in the response shape
      _warning: 'this secret will not be shown again — store it securely now',
    };
  }

  @Delete(':keyId')
  async revoke(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.workspaces.requireRole(workspaceId, user.id, ['owner']);
    return this.keys.revoke(workspaceId, keyId);
  }
}
