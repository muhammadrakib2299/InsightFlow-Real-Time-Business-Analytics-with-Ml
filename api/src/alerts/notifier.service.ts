import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

export interface AlertFirePayload {
  alertId: string;
  alertName: string;
  workspaceId: string;
  metric: string;
  method: string;
  value: number;
  expected: number | null;
  firedAt: string;
}

type Channel =
  | { type: 'email'; config: { to: string; subject?: string } }
  | { type: 'slack'; config: { webhookUrl: string } }
  | { type: 'webhook'; config: { url: string; secret?: string } };

@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);
  private readonly resendKey: string;
  private readonly fromEmail: string;

  constructor(config: ConfigService) {
    this.resendKey = config.get<string>('RESEND_API_KEY', '') as string;
    this.fromEmail = config.get<string>('RESEND_FROM_EMAIL', 'alerts@insightflow.local') as string;
  }

  async fanout(channels: Channel[], payload: AlertFirePayload): Promise<void> {
    await Promise.allSettled(
      channels.map((ch) => this.deliver(ch, payload).catch((err) => this.logErr(ch, err))),
    );
  }

  private async deliver(ch: Channel, payload: AlertFirePayload): Promise<void> {
    if (ch.type === 'email') return this.email(ch.config, payload);
    if (ch.type === 'slack') return this.slack(ch.config, payload);
    if (ch.type === 'webhook') return this.webhook(ch.config, payload);
  }

  private async email(
    cfg: { to: string; subject?: string },
    payload: AlertFirePayload,
  ): Promise<void> {
    if (!this.resendKey) {
      this.logger.warn('email notifier disabled — RESEND_API_KEY not set');
      return;
    }
    const subject = cfg.subject || `[InsightFlow] ${payload.alertName} fired`;
    const html = `
      <h2>${payload.alertName}</h2>
      <p>Metric <code>${payload.metric}</code> fired ${payload.method} detection.</p>
      <ul>
        <li>Value: ${payload.value}</li>
        <li>Expected: ${payload.expected ?? '—'}</li>
        <li>Time: ${payload.firedAt}</li>
      </ul>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.resendKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: this.fromEmail, to: cfg.to, subject, html }),
    });
    if (!res.ok) {
      throw new Error(`resend ${res.status}: ${await res.text().catch(() => '')}`);
    }
  }

  private async slack(cfg: { webhookUrl: string }, payload: AlertFirePayload): Promise<void> {
    const text =
      `*${payload.alertName}* fired — ${payload.metric} ${payload.method}\n` +
      `value=${payload.value}, expected=${payload.expected ?? '—'} (${payload.firedAt})`;
    const res = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`slack ${res.status}`);
  }

  private async webhook(
    cfg: { url: string; secret?: string },
    payload: AlertFirePayload,
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cfg.secret) {
      const sig = createHmac('sha256', cfg.secret).update(body).digest('hex');
      headers['x-insightflow-signature'] = `sha256=${sig}`;
    }
    const res = await fetch(cfg.url, { method: 'POST', headers, body });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
  }

  private logErr(ch: Channel, err: unknown): void {
    this.logger.warn(
      `notifier ${ch.type} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
