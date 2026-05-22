'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { KpiTile } from '@/components/widgets/KpiTile';
import { ForecastBand } from '@/components/widgets/ForecastBand';
import { CohortHeatmap } from '@/components/widgets/CohortHeatmap';
import { FunnelChart } from '@/components/widgets/FunnelChart';
import { FilterPanel } from '@/components/layout/FilterPanel';
import { createWidget, getDashboard } from '@/lib/dashboards';
import { defaultFilters, type DashboardFilters } from '@/lib/filters';

const KPI_METRICS = [
  { key: 'mrr', label: 'MRR' },
  { key: 'dau', label: 'Daily active users' },
  { key: 'signups', label: 'Signups' },
  { key: 'churn', label: 'Churn' },
  { key: 'payments', label: 'Payments' },
];

type WidgetType = 'kpi' | 'forecast' | 'cohort' | 'funnel';

type WidgetConfig = {
  metric?: string;
  horizonDays?: number;
  modelKind?: 'prophet' | 'arima';
  windowDays?: number;
  steps?: string[];
  windowHours?: number;
};

export default function DashboardPage() {
  const params = useParams<{ id: string }>();
  const dashboardId = params.id;
  const qc = useQueryClient();
  const [widgetType, setWidgetType] = useState<WidgetType>('kpi');
  const [metric, setMetric] = useState('mrr');
  const [filters, setFilters] = useState<DashboardFilters>(() => defaultFilters(30));

  const dash = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => getDashboard(dashboardId),
  });

  const addWidget = useMutation({
    mutationFn: () => {
      if (widgetType === 'kpi') {
        return createWidget(dashboardId, {
          type: 'kpi',
          title: KPI_METRICS.find((m) => m.key === metric)?.label ?? metric,
          configJson: { metric },
        });
      }
      if (widgetType === 'forecast') {
        return createWidget(dashboardId, {
          type: 'forecast',
          title: `${KPI_METRICS.find((m) => m.key === metric)?.label ?? metric} forecast`,
          configJson: { metric, horizonDays: 30, modelKind: 'prophet' },
        });
      }
      if (widgetType === 'cohort') {
        return createWidget(dashboardId, {
          type: 'cohort',
          title: 'Cohort retention',
          configJson: { windowDays: 84 },
        });
      }
      return createWidget(dashboardId, {
        type: 'funnel',
        title: 'Signup → payment funnel',
        configJson: {
          steps: ['signup', 'subscription_started', 'subscription_payment'],
          windowDays: 30,
          windowHours: 24 * 7,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
    },
  });

  const widgets = dash.data?.widgets ?? [];
  const grouped = useMemo(() => {
    const kpis = widgets.filter((w) => w.type === 'kpi');
    const forecasts = widgets.filter((w) => w.type === 'forecast');
    const cohorts = widgets.filter((w) => w.type === 'cohort');
    const funnels = widgets.filter((w) => w.type === 'funnel');
    const other = widgets.filter(
      (w) => !['kpi', 'forecast', 'cohort', 'funnel'].includes(w.type),
    );
    return { kpis, forecasts, cohorts, funnels, other };
  }, [widgets]);

  const isEmpty = !dash.isLoading && widgets.length === 0;

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* ─────────────────────── Sidebar ─────────────────────── */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader title="Add widget" />
          <div className="space-y-3">
            <div>
              <span className="label">Type</span>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {(['kpi', 'forecast', 'cohort', 'funnel'] as WidgetType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setWidgetType(t)}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition ${
                      widgetType === t
                        ? 'border-accent/60 bg-accent/10 text-fg'
                        : 'border-border bg-surface/40 text-fg-muted hover:bg-surface/70'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {(widgetType === 'kpi' || widgetType === 'forecast') && (
              <label className="block">
                <span className="label">Metric</span>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                  className="input mt-1 h-9 text-sm"
                >
                  {KPI_METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {widgetType === 'cohort' && (
              <p className="text-xs text-fg-muted">
                Adds a 12-week retention heatmap based on first-seen signups.
              </p>
            )}
            {widgetType === 'funnel' && (
              <p className="text-xs text-fg-muted">
                Default steps: signup → subscription_started → subscription_payment.
              </p>
            )}

            <button
              onClick={() => addWidget.mutate()}
              disabled={addWidget.isPending}
              className="btn-primary h-9 w-full text-sm"
            >
              {addWidget.isPending ? 'Adding…' : 'Add to dashboard'}
            </button>
            {addWidget.isError && (
              <p className="text-xs text-red-400">
                Failed to add widget. Check the API logs.
              </p>
            )}
          </div>
        </Card>

        <FilterPanel value={filters} onChange={setFilters} />

        <Card>
          <CardHeader title="At a glance" />
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="KPI tiles" value={grouped.kpis.length} />
            <Stat label="Forecasts" value={grouped.forecasts.length} />
            <Stat label="Cohorts" value={grouped.cohorts.length} />
            <Stat label="Funnels" value={grouped.funnels.length} />
          </dl>
        </Card>
      </aside>

      {/* ─────────────────────── Main canvas ─────────────────────── */}
      <div className="min-w-0 space-y-8">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <nav className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
              <Link href="/dashboards" className="transition hover:text-fg">
                Dashboards
              </Link>
              <span className="opacity-40">/</span>
              <span className="truncate text-fg/80">{dash.data?.name ?? '…'}</span>
            </nav>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              {dash.data?.name ?? 'Loading…'}
            </h1>
            {dash.data?.description && (
              <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">
                {dash.data.description}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 text-xs text-fg-muted">
            <span className="chip">
              <span className="tabular-nums text-fg">{widgets.length}</span>
              widget{widgets.length === 1 ? '' : 's'}
            </span>
            {dash.data?.updatedAt && (
              <span className="hidden sm:inline">
                Updated {new Date(dash.data.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </header>

        {dash.isLoading && (
          <div className="card animate-pulse p-6 text-sm text-fg-muted">Loading dashboard…</div>
        )}

        {isEmpty && (
          <EmptyCanvas
            onAdd={() => addWidget.mutate()}
            pending={addWidget.isPending}
          />
        )}

        {grouped.kpis.length > 0 && (
          <Section title="Key metrics" hint="Live KPIs from the BFF cache.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {grouped.kpis.map((w) => {
                const cfg = (w.configJson ?? {}) as WidgetConfig;
                return (
                  <KpiTile key={w.id} metric={cfg.metric ?? 'mrr'} title={w.title} />
                );
              })}
            </div>
          </Section>
        )}

        {grouped.forecasts.length > 0 && (
          <Section title="Forecasts" hint="Prophet / ARIMA — retrained nightly.">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {grouped.forecasts.map((w) => {
                const cfg = (w.configJson ?? {}) as WidgetConfig;
                return (
                  <ForecastBand
                    key={w.id}
                    metric={cfg.metric ?? 'mrr'}
                    title={w.title}
                    horizonDays={cfg.horizonDays ?? 30}
                    modelKind={cfg.modelKind}
                  />
                );
              })}
            </div>
          </Section>
        )}

        {(grouped.cohorts.length > 0 || grouped.funnels.length > 0) && (
          <Section title="Cohorts &amp; funnels" hint="Retention curves and conversion paths.">
            <div className="grid grid-cols-1 gap-4">
              {grouped.cohorts.map((w) => {
                const cfg = (w.configJson ?? {}) as WidgetConfig;
                return (
                  <CohortHeatmap
                    key={w.id}
                    title={w.title}
                    windowDays={cfg.windowDays ?? 84}
                  />
                );
              })}
              {grouped.funnels.map((w) => {
                const cfg = (w.configJson ?? {}) as WidgetConfig;
                const steps = cfg.steps ?? [
                  'signup',
                  'subscription_started',
                  'subscription_payment',
                ];
                return (
                  <FunnelChart
                    key={w.id}
                    title={w.title}
                    steps={steps}
                    windowDays={cfg.windowDays ?? 30}
                    windowHours={cfg.windowHours ?? 24 * 7}
                  />
                );
              })}
            </div>
          </Section>
        )}

        {grouped.other.length > 0 && (
          <Section title="Other widgets">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {grouped.other.map((w) => (
                <article
                  key={w.id}
                  className="rounded-lg border border-border bg-surface/40 p-4 text-sm text-fg-muted"
                >
                  {w.title}{' '}
                  <span className="text-xs opacity-70">({w.type})</span> — renderer
                  not implemented yet.
                </article>
              ))}
            </div>
          </Section>
        )}
      </div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card p-4">{children}</div>;
}

function CardHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
      {title}
    </h2>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
        <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>
        {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-fg-muted">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-bold tabular-nums tracking-tight text-fg">
        {value}
      </dd>
    </div>
  );
}

function EmptyCanvas({ onAdd, pending }: { onAdd: () => void; pending: boolean }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <div>
        <h3 className="text-base font-medium">This dashboard is empty</h3>
        <p className="mt-1 max-w-md text-sm text-fg-muted">
          Use the sidebar to drop in KPI tiles, forecasts, cohort heatmaps, or
          funnels — everything updates live from your event stream.
        </p>
      </div>
      <button onClick={onAdd} disabled={pending} className="btn-primary h-9 px-4 text-sm">
        {pending ? 'Adding…' : 'Add your first widget'}
      </button>
    </div>
  );
}
