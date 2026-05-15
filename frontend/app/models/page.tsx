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
    <section className="mx-auto max-w-5xl">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Latest fitted Prophet and ARIMA models per metric. The MAPE column
            is mean absolute percentage error on a 14-day holdout split — lower
            is better. Dashboards use whichever model has the lower MAPE.
          </p>
        </div>
        <Link href="/dashboards" className="link-accent text-sm">
          ← Back to dashboards
        </Link>
      </header>

      <div className="mt-6">
        {models.isLoading && (
          <div className="card flex items-center gap-2 p-4 text-sm text-fg-muted">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
            Loading models…
          </div>
        )}

        {models.isError && (
          <div className="card border-red-500/30 p-4 text-sm text-red-400">
            Failed to load models. The forecast service may be down, or no
            retrain has run yet.
          </div>
        )}

        {models.data && rows.length === 0 && <EmptyModels />}

        {rows.length > 0 && (
          <div className="card overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-subtle/40 text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-3 font-medium">Metric</th>
                  <th className="px-4 py-3 font-medium">Prophet MAPE</th>
                  <th className="px-4 py-3 font-medium">ARIMA MAPE</th>
                  <th className="px-4 py-3 font-medium">Picked</th>
                  <th className="px-4 py-3 font-medium">Fitted</th>
                  <th className="px-4 py-3 font-medium">Window</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pick = winner(r);
                  const fittedAt = r.prophet?.fitted_at ?? r.arima?.fitted_at;
                  const window =
                    r.prophet?.training_window_days ?? r.arima?.training_window_days;
                  return (
                    <tr
                      key={r.metric}
                      className="border-b border-border/40 last:border-0 hover:bg-bg-subtle/30"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-medium uppercase tracking-wide">
                          {r.metric}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 font-mono text-xs ${
                          pick === 'prophet' ? 'font-semibold text-fg' : 'text-fg-muted'
                        }`}
                      >
                        {fmtMape(r.prophet?.mape)}
                      </td>
                      <td
                        className={`px-4 py-3 font-mono text-xs ${
                          pick === 'arima' ? 'font-semibold text-fg' : 'text-fg-muted'
                        }`}
                      >
                        {fmtMape(r.arima?.mape)}
                      </td>
                      <td className="px-4 py-3">
                        {pick ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                            {pick}
                          </span>
                        ) : (
                          <span className="text-xs text-fg-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-muted">
                        {fittedAt ? fmtAge(fittedAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-fg-muted">
                        {window ? `${window}d` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs text-fg-muted">
          Both models retrain nightly at 02:00 UTC. The dashboard widgets pick
          Prophet by default, falling back to ARIMA when Prophet is missing.
        </p>
      </div>
    </section>
  );
}

function EmptyModels() {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 4 4 5-7" />
        </svg>
      </div>
      <div>
        <h3 className="text-base font-medium">No fitted models yet</h3>
        <p className="mt-1 max-w-md text-sm text-fg-muted">
          Models retrain nightly at 02:00 UTC once you have ~14 days of
          historical data. You can also trigger a retrain manually by POSTing
          to <code className="rounded bg-bg-subtle px-1 py-0.5 font-mono text-xs">/retrain</code>{' '}
          on the forecast service with your <code className="font-mono text-xs">RETRAIN_SHARED_SECRET</code>.
        </p>
      </div>
    </div>
  );
}
