import { apiFetch } from './api';
import { getActiveWorkspace } from './auth';

export interface ForecastPoint {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface ForecastResponse {
  workspace_id: string;
  metric: string;
  model_kind: 'prophet' | 'arima';
  fitted_at: string;
  mape: number | null;
  history: ForecastPoint[];
  forecast: ForecastPoint[];
}

export interface ModelMetadata {
  workspace_id: string;
  metric: string;
  model_kind: 'prophet' | 'arima';
  fitted_at: string;
  training_window_days: number;
  mape: number | null;
}

function workspaceBase(): string {
  const ws = getActiveWorkspace();
  if (!ws) throw new Error('no active workspace');
  return `/api/workspaces/${ws.id}`;
}

export async function fetchForecast(params: {
  metric: string;
  horizonDays?: number;
  modelKind?: 'prophet' | 'arima';
}): Promise<ForecastResponse> {
  const qs = new URLSearchParams({
    metric: params.metric,
    horizon_days: String(params.horizonDays ?? 30),
  });
  if (params.modelKind) qs.set('model_kind', params.modelKind);
  return apiFetch<ForecastResponse>(`${workspaceBase()}/forecast?${qs.toString()}`);
}

export async function fetchModels(): Promise<ModelMetadata[]> {
  return apiFetch<ModelMetadata[]>(`${workspaceBase()}/forecast/models`);
}
