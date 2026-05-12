import { apiFetch } from './api';
import { getActiveWorkspace } from './auth';

export interface Dashboard {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  layoutJson: Array<{ i: string; x: number; y: number; w: number; h: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface Widget {
  id: string;
  dashboardId: string;
  type: 'kpi' | 'line' | 'bar' | 'funnel' | 'cohort' | 'forecast' | 'table';
  title: string;
  configJson: Record<string, unknown>;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardDetail extends Dashboard {
  widgets: Widget[];
}

export interface KpiPoint {
  ts: string;
  value: number;
}

export interface KpiSeries {
  metric: string;
  label: string;
  granularity: 'hour' | 'day';
  unit: 'cents' | 'count' | 'users';
  points: KpiPoint[];
  cache: { hit: boolean; ttlSeconds: number };
}

function workspaceBase(): string {
  const ws = getActiveWorkspace();
  if (!ws) throw new Error('no active workspace');
  return `/api/workspaces/${ws.id}`;
}

export async function listDashboards(): Promise<Dashboard[]> {
  return apiFetch<Dashboard[]>(`${workspaceBase()}/dashboards`);
}

export async function getDashboard(id: string): Promise<DashboardDetail> {
  return apiFetch<DashboardDetail>(`${workspaceBase()}/dashboards/${id}`);
}

export async function createDashboard(input: {
  name: string;
  description?: string;
}): Promise<Dashboard> {
  return apiFetch<Dashboard>(`${workspaceBase()}/dashboards`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createWidget(
  dashboardId: string,
  input: Partial<Widget> & { type: Widget['type']; title: string },
): Promise<Widget> {
  return apiFetch<Widget>(`${workspaceBase()}/dashboards/${dashboardId}/widgets`, {
    method: 'POST',
    body: JSON.stringify({
      type: input.type,
      title: input.title,
      config: input.configJson,
      positionX: input.positionX,
      positionY: input.positionY,
      width: input.width,
      height: input.height,
    }),
  });
}

export async function fetchKpi(params: {
  metric: string;
  from: string;
  to: string;
  granularity?: 'hour' | 'day';
}): Promise<KpiSeries> {
  const qs = new URLSearchParams({
    metric: params.metric,
    from: params.from,
    to: params.to,
    granularity: params.granularity ?? 'day',
  });
  return apiFetch<KpiSeries>(`${workspaceBase()}/events/kpi?${qs.toString()}`);
}
