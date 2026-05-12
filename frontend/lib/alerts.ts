import { apiFetch } from './api';
import { getActiveWorkspace } from './auth';

export type AlertMethod = 'zscore' | 'iqr' | 'threshold';

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook';
  config: Record<string, unknown>;
}

export interface Alert {
  id: string;
  workspaceId: string;
  name: string;
  metric: string;
  method: AlertMethod;
  thresholdParams: Record<string, unknown>;
  channelsJson: AlertChannel[];
  cooldownSeconds: number;
  enabled: boolean;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: string;
  alertId: string;
  workspaceId: string;
  firedAt: string;
  value: number;
  expected: number | null;
  payload: Record<string, unknown>;
  alert?: { name: string; metric: string };
}

function base(): string {
  const ws = getActiveWorkspace();
  if (!ws) throw new Error('no active workspace');
  return `/api/workspaces/${ws.id}/alerts`;
}

export async function listAlerts(): Promise<Alert[]> {
  return apiFetch<Alert[]>(base());
}

export async function alertHistory(): Promise<AlertEvent[]> {
  return apiFetch<AlertEvent[]>(`${base()}/history`);
}

export async function createAlert(input: {
  name: string;
  metric: string;
  method: AlertMethod;
  thresholdParams: Record<string, unknown>;
  channels: AlertChannel[];
  cooldownSeconds?: number;
}): Promise<Alert> {
  return apiFetch<Alert>(base(), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function toggleAlert(id: string, enabled: boolean): Promise<Alert> {
  return apiFetch<Alert>(`${base()}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export async function deleteAlert(id: string): Promise<void> {
  await apiFetch(`${base()}/${id}`, { method: 'DELETE' });
}
