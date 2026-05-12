'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Area,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchForecast, type ForecastPoint } from '@/lib/forecast';

interface ForecastBandProps {
  metric: string;
  title: string;
  horizonDays?: number;
  modelKind?: 'prophet' | 'arima';
}

type ChartRow = {
  ds: string;
  actual: number | null;
  yhat: number | null;
  band: [number, number] | null;
};

function combine(history: ForecastPoint[], forecast: ForecastPoint[]): ChartRow[] {
  // History rows have yhat==yhat_lower==yhat_upper==y (server-side
  // convention). We carry them as `actual` in the chart and leave the
  // band columns null so they don't render a band over history.
  const historyRows: ChartRow[] = history.map((p) => ({
    ds: p.ds,
    actual: p.yhat,
    yhat: null,
    band: null,
  }));
  const forecastRows: ChartRow[] = forecast.map((p) => ({
    ds: p.ds,
    actual: null,
    yhat: p.yhat,
    band: [p.yhat_lower, p.yhat_upper],
  }));
  return [...historyRows, ...forecastRows];
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toString();
}

export function ForecastBand({
  metric,
  title,
  horizonDays = 30,
  modelKind,
}: ForecastBandProps) {
  const query = useQuery({
    queryKey: ['forecast', metric, horizonDays, modelKind ?? 'auto'],
    queryFn: () => fetchForecast({ metric, horizonDays, modelKind }),
    staleTime: 5 * 60_000,
  });

  return (
    <article className="flex h-full flex-col rounded-lg border border-bg-subtle/80 bg-bg-subtle/40 p-4">
      <header className="flex items-baseline justify-between text-sm text-fg-muted">
        <h3 className="font-medium text-fg">{title}</h3>
        <span>
          {query.data && (
            <>
              {query.data.model_kind}
              {query.data.mape != null && (
                <span className="ml-2">MAPE {(query.data.mape * 100).toFixed(1)}%</span>
              )}
            </>
          )}
        </span>
      </header>

      <div className="mt-3 h-64">
        {query.isLoading && <div className="text-sm text-fg-muted">Loading forecast…</div>}
        {query.isError && (
          <div className="text-sm text-red-400">
            Failed to load forecast — model may not be trained yet (POST /retrain).
          </div>
        )}
        {query.data && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={combine(query.data.history, query.data.forecast)}>
              <XAxis
                dataKey="ds"
                stroke="rgb(var(--fg-muted))"
                fontSize={11}
                tickMargin={6}
                minTickGap={32}
              />
              <YAxis
                stroke="rgb(var(--fg-muted))"
                fontSize={11}
                tickFormatter={formatTick}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgb(var(--bg-subtle))',
                  border: '1px solid rgba(0,0,0,0.1)',
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="rgb(var(--accent))"
                fillOpacity={0.15}
                isAnimationActive={false}
                name="80% CI"
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="rgb(var(--fg))"
                strokeWidth={1.5}
                dot={false}
                name="Actual"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="yhat"
                stroke="rgb(var(--accent))"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                name="Forecast"
                isAnimationActive={false}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
}
