import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { WidgetsController } from './widgets.controller';
import { WidgetsService } from './widgets.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [DashboardsController, WidgetsController],
  providers: [DashboardsService, WidgetsService],
  exports: [DashboardsService, WidgetsService],
})
export class DashboardsModule {}
