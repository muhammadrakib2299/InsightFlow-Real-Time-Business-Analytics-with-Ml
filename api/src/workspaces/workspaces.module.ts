import { Module } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { WorkspaceGuard } from './workspace.guard';

@Module({
  controllers: [WorkspacesController, ApiKeysController],
  providers: [WorkspacesService, ApiKeysService, WorkspaceGuard],
  exports: [WorkspacesService, ApiKeysService, WorkspaceGuard],
})
export class WorkspacesModule {}
