import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { HealthController } from './common/health.controller';
import { AuthModule } from './auth/auth.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { EventsModule } from './events/events.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ForecastModule } from './forecast/forecast.module';
import { AlertsModule } from './alerts/alerts.module';
import { PdfModule } from './pdf/pdf.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60_000, limit: 600 },
    ]),
    CommonModule,
    AuthModule,
    WorkspacesModule,
    DashboardsModule,
    EventsModule,
    RealtimeModule,
    ForecastModule,
    AlertsModule,
    PdfModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
