import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertEvaluator } from './alert-evaluator.service';
import { NotifierService } from './notifier.service';

@Module({
  imports: [ScheduleModule.forRoot(), WorkspacesModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertEvaluator, NotifierService],
  exports: [AlertsService],
})
export class AlertsModule {}
