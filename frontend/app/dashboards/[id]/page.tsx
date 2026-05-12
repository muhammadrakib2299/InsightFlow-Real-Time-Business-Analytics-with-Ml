'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { KpiTile } from '@/components/widgets/KpiTile';
import { ForecastBand } from '@/components/widgets/ForecastBand';
import { createWidget, getDashboard } from '@/lib/dashboards';

const KPI_METRICS = [
  { key: 'mrr', label: 'MRR' },
  { key: 'dau', label: 'Daily active users' },
  { key: 'signups', label: 'Signups' },
  { key: 'churn', label: 'Churn' },
  { key: 'payments', label: 'Payments' },
];

export default function DashboardPage() {
  const params = useParams<{ id: string }>();
  const dashboardId = params.id;
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [metric, setMetric] = useState('mrr');

  const dash = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => getDashboard(dashboardId),
  });

  const addWidget = useMutation({
    mutationFn: () =>
      createWidget(dashboardId, {
        type: 'kpi',
        title: KPI_METRICS.find((m) => m.key === metric)?.label ?? metric,
        configJson: { metric },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      setAdding(false);
    },
  });

  return (
    <section className="mx-auto max-w-6xl">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {dash.data?.name ?? 'Loading…'}
          </h1>
          {dash.data?.description && (
            <p className="mt-1 text-sm text-fg-muted">{dash.data.description}</p>
          )}
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
        >
          {adding ? 'Cancel' : 'Add KPI tile'}
        </button>
      </header>

      {adding && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-bg-subtle bg-bg-subtle/30 p-3">
          <label className="text-sm text-fg-muted">Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="rounded-md border border-bg-subtle bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {KPI_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => addWidget.mutate()}
            disabled={addWidget.isPending}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {addWidget.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dash.data?.widgets.length === 0 && (
          <div className="col-span-full rounded-md border border-dashed border-bg-subtle/80 px-4 py-10 text-center text-sm text-fg-muted">
            No widgets yet. Add a KPI tile above.
          </div>
        )}
        {dash.data?.widgets.map((w) => {
          const cfg = w.configJson as {
            metric?: string;
            horizonDays?: number;
            modelKind?: 'prophet' | 'arima';
          };
          if (w.type === 'kpi') {
            return (
              <KpiTile
                key={w.id}
                metric={cfg.metric ?? 'mrr'}
                title={w.title}
              />
            );
          }
          if (w.type === 'forecast') {
            return (
              <div key={w.id} className="sm:col-span-2 lg:col-span-3">
                <ForecastBand
                  metric={cfg.metric ?? 'mrr'}
                  title={w.title}
                  horizonDays={cfg.horizonDays ?? 30}
                  modelKind={cfg.modelKind}
                />
              </div>
            );
          }
          return (
            <article
              key={w.id}
              className="rounded-lg border border-bg-subtle/80 bg-bg-subtle/40 p-4 text-sm text-fg-muted"
            >
              {w.title} ({w.type}) — renderer not implemented yet
            </article>
          );
        })}
      </div>
    </section>
  );
}
