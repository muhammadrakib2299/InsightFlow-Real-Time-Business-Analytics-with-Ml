import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Alert } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { AlertsService } from './alerts.service';
import { NotifierService, AlertFirePayload } from './notifier.service';

interface AnomalyPoint {
  ds: string;
  value: number;
  expected: number | null;
  is_anomaly: boolean;
}

interface AnomalyResponse {
  workspace_id: string;
  metric: string;
  method: 'zscore' | 'iqr';
  points: AnomalyPoint[];
}

/**
 * Periodically evaluates every enabled alert in the database by
 * calling the forecast service's /anomaly endpoint and recording any
 * triggered events. Cool-down is enforced by Alert.last_fired_at so a
 * persistent anomaly doesn't spam channels.
 */
@Injectable()
export class AlertEvaluator {
  private readonly logger = new Logger(AlertEvaluator.name);
  private readonly forecastUrl: string;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly alerts: AlertsService,
    private readonly notifier: NotifierService,
    config: ConfigService,
  ) {
    this.forecastUrl = (
      config.get<string>('FORECAST_SERVICE_URL', 'http://forecast:8000') as string
    ).replace(/\/+$/, '');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async evaluate(): Promise<void> {
    if (this.running) {
      this.logger.warn('alert evaluation already in progress — skipping tick');
      return;
    }
    this.running = true;
    try {
      const enabled = await this.prisma.alert.findMany({ where: { enabled: true } });
      this.logger.log(`evaluating ${enabled.length} enabled alert(s)`);
      for (const alert of enabled) {
        await this.evaluateOne(alert).catch((err) =>
          this.logger.warn(
            `alert ${alert.id} eval failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async evaluateOne(alert: Alert): Promise<void> {
    if (alert.method === 'threshold') {
      // Threshold-only alerts are evaluated against the latest KPI value
      // directly. Out-of-scope for v1; we just skip them rather than
      // throwing — the alert config UI still lets users save them for
      // future use.
      return;
    }

    const params =
      (alert.thresholdParams as Record<string, number> | null) ?? {};
    const body = {
      workspace_id: alert.workspaceId,
      metric: alert.metric,
      method: alert.method,
      window_days: Number(params.windowDays ?? (alert.method === 'iqr' ? 14 : 7)),
      threshold: Number(params.threshold ?? (alert.method === 'iqr' ? 1.5 : 3.0)),
    };

    const res = await fetch(`${this.forecastUrl}/anomaly`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`forecast /anomaly ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const data = (await res.json()) as AnomalyResponse;
    const lastFlagged = [...data.points].reverse().find((p) => p.is_anomaly);
    if (!lastFlagged) return;

    // Cool-down: only re-fire if last fire is older than cooldownSeconds
    const now = Date.now();
    if (
      alert.lastFiredAt &&
      now - alert.lastFiredAt.getTime() < alert.cooldownSeconds * 1000
    ) {
      return;
    }

    const firedAt = new Date();
    const event = await this.alerts.recordFire(
      alert.workspaceId,
      alert.id,
      lastFlagged.value,
      lastFlagged.expected ?? null,
      { ds: lastFlagged.ds, method: data.method },
    );
    await this.prisma.alert.update({
      where: { id: alert.id },
      data: { lastFiredAt: firedAt },
    });

    const firePayload: AlertFirePayload = {
      alertId: alert.id,
      alertName: alert.name,
      workspaceId: alert.workspaceId,
      metric: alert.metric,
      method: alert.method,
      value: lastFlagged.value,
      expected: lastFlagged.expected ?? null,
      firedAt: firedAt.toISOString(),
    };

    // Fan out to channels
    const channels = (alert.channelsJson as unknown) as Array<{
      type: 'email' | 'slack' | 'webhook';
      config: Record<string, unknown>;
    }>;
    await this.notifier.fanout(channels as Parameters<NotifierService['fanout']>[0], firePayload);

    // Publish to Redis for live toast in the UI
    await this.redis.client.publish(
      `alerts:fired:${alert.workspaceId}`,
      JSON.stringify({ ...firePayload, eventId: event.id }),
    );

    this.logger.log(`alert ${alert.name} (${alert.id}) fired @ ${firedAt.toISOString()}`);
  }
}
