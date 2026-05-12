'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchModels, type ModelMetadata } from '@/lib/forecast';

type Row = {
  metric: string;
  prophet?: ModelMetadata;
  arima?: ModelMetadata;
};

function rollup(models: ModelMetadata[]): Row[] {
  const byMetric = new Map<string, Row>();
  for (const m of models) {
    const row = byMetric.get(m.metric) ?? { metric: m.metric };
    if (m.model_kind === 'prophet') {
      row.prophet = pickNewer(row.prophet, m);
    } else if (m.model_kind === 'arima') {
      row.arima = pickNewer(row.arima, m);
    }
    byMetric.set(m.metric, row);
  }
  return [...byMetric.values()].sort((a, b) => a.metric.localeCompare(b.metric));
}

function pickNewer(a: ModelMetadata | undefined, b: ModelMetadata): ModelMetadata {
  if (!a) return b;
  return new Date(b.fitted_at).getTime() > new Date(a.fitted_at).getTime() ? b : a;
}

function fmtMape(mape: number | null | undefined): string {
  if (mape == null || Number.isNaN(mape)) return '—';
  return `${(mape * 100).toFixed(1)}%`;
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function winner(row: Row): 'prophet' | 'arima' | null {
  if (row.prophet?.mape == null && row.arima?.mape == null) return null;
  if (row.prophet?.mape == null) return 'arima';
  if (row.arima?.mape == null) return 'prophet';
  return row.prophet.mape <= row.arima.mape ? 'prophet' : 'arima';
}

export default function ModelsPage() {
  const models = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
  });
  const rows = useMemo(() => (models.data ? rollup(models.data) : []), [models.data]);

  return (
    <section className="mx-auto max-w-4xl">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Latest fitted Prophet and ARIMA models per metric. Numbers are MAPE on
            a 14-day holdout split — lower is better.
          </p>
        </div>
        <Link href="/dashboards" className="text-sm text-accent underline-offset-4 hover:underline">
          ← Back to dashboards
        </Link>
      </header>

      {models.isLoading && <p className="mt-6 text-sm text-fg-muted">Loading…</p>}
      {models.isError && (
        <p className="mt-6 text-sm text-red-400">
          Failed to load models. The forecast service may be down or no retrain has
          run yet.
        </p>
      )}
      {models.data && rows.length === 0 && (
        <div className="mt-6 rounded-md border border-dashed border-bg-subtle/80 px-4 py-10 text-center text-sm text-fg-muted">
          No fitted models yet. POST /retrain or wait for the 02:00 UTC nightly job.
        </div>
      )}

      {rows.length > 0 && (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-bg-subtle text-left text-xs uppercase tracking-wide text-fg-muted">
              <th className="py-2">Metric</th>
              <th className="py-2">Prophet MAPE</th>
              <th className="py-2">ARIMA MAPE</th>
              <th className="py-2">Picked</th>
              <th className="py-2">Fitted</th>
              <th className="py-2">Training window</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pick = winner(r);
              const fittedAt = r.prophet?.fitted_at ?? r.arima?.fitted_at;
              const window =
                r.prophet?.training_window_days ?? r.arima?.training_window_days;
              return (
                <tr key={r.metric} className="border-b border-bg-subtle/40 last:border-0">
                  <td className="py-3 font-medium">{r.metric}</td>
                  <td
                    className={`py-3 ${
                      pick === 'prophet' ? 'text-fg' : 'text-fg-muted'
                    }`}
                  >
                    {fmtMape(r.prophet?.mape)}
                  </td>
                  <td
                    className={`py-3 ${
                      pick === 'arima' ? 'text-fg' : 'text-fg-muted'
                    }`}
                  >
                    {fmtMape(r.arima?.mape)}
                  </td>
                  <td className="py-3">
                    {pick ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent">
                        {pick}
                      </span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 text-fg-muted">{fittedAt ? fmtAge(fittedAt) : '—'}</td>
                  <td className="py-3 text-fg-muted">{window ? `${window}d` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="mt-6 text-xs text-fg-muted">
        We retrain both models nightly at 02:00 UTC. The dashboard widgets use
        the Prophet model unless it's missing, in which case the ARIMA baseline
        is served as a fallback.
      </p>
    </section>
  );
}
