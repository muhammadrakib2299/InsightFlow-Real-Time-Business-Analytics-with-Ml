import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { MetricsGateway } from './metrics.gateway';

@Module({
  imports: [AuthModule, WorkspacesModule],
  providers: [MetricsGateway],
  exports: [MetricsGateway],
})
export class RealtimeModule {}
