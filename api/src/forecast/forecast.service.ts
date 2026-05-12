import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isKnownMetric } from '../events/metrics';

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

@Injectable()
export class ForecastService {
  private readonly logger = new Logger(ForecastService.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('FORECAST_SERVICE_URL', 'http://forecast:8000') as string
    ).replace(/\/+$/, '');
  }

  async forecast(
    workspaceId: string,
    metric: string,
    horizonDays: number,
    modelKind?: 'prophet' | 'arima',
  ): Promise<ForecastResponse> {
    if (!isKnownMetric(metric)) {
      throw new HttpException(`unknown metric "${metric}"`, 400);
    }
    if (horizonDays < 1 || horizonDays > 365) {
      throw new HttpException('horizon_days must be 1..365', 400);
    }
    const body: Record<string, unknown> = {
      workspace_id: workspaceId,
      metric,
      horizon_days: horizonDays,
    };
    if (modelKind) body.model_kind = modelKind;

    const res = await fetch(`${this.baseUrl}/forecast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpException(text || `forecast service ${res.status}`, res.status);
    }
    return (await res.json()) as ForecastResponse;
  }

  async listModels(workspaceId: string): Promise<ModelMetadata[]> {
    const res = await fetch(`${this.baseUrl}/models`);
    if (!res.ok) {
      throw new HttpException('forecast service unreachable', 502);
    }
    const all = (await res.json()) as ModelMetadata[];
    return all.filter((m) => m.workspace_id === workspaceId);
  }
}
