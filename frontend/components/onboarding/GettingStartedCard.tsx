'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createApiKey, listApiKeys, type IssuedApiKey } from '@/lib/apikeys';
import { listDashboards, getDashboard } from '@/lib/dashboards';
import { fetchModels } from '@/lib/forecast';
import {
  dismissChecklist,
  isChecklistDismissed,
  isEventMarkedSent,
  markEventSent,
} from '@/lib/onboarding';

const INGEST_BASE =
  process.env.NEXT_PUBLIC_INGEST_URL ?? 'http://localhost:5000';

type StepStatus = 'done' | 'todo' | 'loading';

interface Step {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  render: () => React.ReactNode;
}

export function GettingStartedCard({
  onCreateDashboard,
}: {
  onCreateDashboard: () => void;
}) {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [eventMarked, setEventMarked] = useState(false);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [copied, setCopied] = useState<'key' | 'curl' | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [keyName, setKeyName] = useState('Default');

  useEffect(() => {
    setDismissed(isChecklistDismissed());
    setEventMarked(isEventMarkedSent());
  }, []);

  const keys = useQuery({ queryKey: ['api-keys'], queryFn: listApiKeys });
  const dashboards = useQuery({ queryKey: ['dashboards'], queryFn: listDashboards });
  const firstDashboardId = dashboards.data?.[0]?.id;
  const firstDashboard = useQuery({
    queryKey: ['dashboard', firstDashboardId],
    queryFn: () => getDashboard(firstDashboardId as string),
    enabled: Boolean(firstDashboardId),
  });
  const models = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
    retry: 0,
  });

  const create = useMutation({
    mutationFn: () => createApiKey({ name: keyName || 'Default' }),
    onSuccess: (data) => {
      setIssued(data);
      setCreatingKey(false);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const hasKey = (keys.data?.filter((k) => !k.revokedAt).length ?? 0) > 0;
  const hasDashboard = (dashboards.data?.length ?? 0) > 0;
  const hasWidget = (firstDashboard.data?.widgets.length ?? 0) > 0;
  const hasModel = (models.data?.length ?? 0) > 0;

  const stepStatus = (cond: boolean, loading: boolean): StepStatus =>
    cond ? 'done' : loading ? 'loading' : 'todo';

  const onCopy = async (which: 'key' | 'curl', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore — clipboard blocked
    }
  };

  const curlSnippet = issued
    ? `curl -X POST ${INGEST_BASE}/v1/events \\
  -H "Authorization: Bearer ${issued.secret}" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"order_completed","properties":{"value":49.0,"currency":"USD"}}'`
    : `curl -X POST ${INGEST_BASE}/v1/events \\
  -H "Authorization: Bearer <your-api-key>" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"order_completed","properties":{"value":49.0,"currency":"USD"}}'`;

  const steps: Step[] = [
    {
      id: 'api-key',
      title: 'Create an API key',
      description: 'Authenticate your event sources.',
      status: stepStatus(hasKey, keys.isLoading),
      render: () => {
        if (issued) {
          return (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-xs font-medium text-emerald-300 dark:text-emerald-200">
                Save this secret — it won't be shown again.
              </p>
              <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-bg/60 px-2 py-1.5 font-mono text-xs">
                <span className="truncate">{issued.secret}</span>
                <button
                  onClick={() => onCopy('key', issued.secret)}
                  className="ml-auto rounded border border-border px-2 py-0.5 text-xs text-fg-muted hover:text-fg"
                >
                  {copied === 'key' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          );
        }
        if (creatingKey) {
          return (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
              className="flex gap-2"
            >
              <input
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Key name (e.g. Production)"
                className="input flex-1"
                autoFocus
              />
              <button
                type="submit"
                disabled={create.isPending}
                className="btn-primary h-9 px-3 text-xs"
              >
                {create.isPending ? 'Creating…' : 'Create key'}
              </button>
              <button
                type="button"
                onClick={() => setCreatingKey(false)}
                className="btn-ghost h-9 px-3 text-xs"
              >
                Cancel
              </button>
            </form>
          );
        }
        return (
          <button
            onClick={() => setCreatingKey(true)}
            className="btn-primary h-9 px-3 text-xs"
          >
            Create API key
          </button>
        );
      },
    },
    {
      id: 'first-event',
      title: 'Send your first event',
      description: 'Use the API key to ingest one event — POST to the ingestion service.',
      status: stepStatus(eventMarked, false),
      render: () => (
        <div>
          <pre className="overflow-x-auto rounded-md border border-border bg-bg/60 p-3 font-mono text-[11px] leading-relaxed text-fg-muted">
            <code>{curlSnippet}</code>
          </pre>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => onCopy('curl', curlSnippet)}
              className="btn-ghost h-8 px-2 text-xs"
            >
              {copied === 'curl' ? 'Copied' : 'Copy snippet'}
            </button>
            <button
              onClick={() => {
                markEventSent();
                setEventMarked(true);
              }}
              className="btn-secondary h-8 px-3 text-xs"
            >
              Mark as done
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'dashboard',
      title: 'Create your first dashboard',
      description: 'A dashboard is a canvas for KPI tiles, charts, and forecasts.',
      status: stepStatus(hasDashboard, dashboards.isLoading),
      render: () => (
        <button onClick={onCreateDashboard} className="btn-primary h-9 px-3 text-xs">
          New dashboard
        </button>
      ),
    },
    {
      id: 'widget',
      title: 'Add a widget',
      description: 'Drop a KPI tile or a chart onto a dashboard.',
      status: stepStatus(hasWidget, firstDashboard.isLoading),
      render: () =>
        firstDashboardId ? (
          <Link
            href={`/dashboards/${firstDashboardId}`}
            className="btn-primary h-9 px-3 text-xs"
          >
            Open dashboard
          </Link>
        ) : (
          <span className="text-xs text-fg-muted">Create a dashboard first.</span>
        ),
    },
    {
      id: 'forecast',
      title: 'Fit your first forecast model',
      description:
        'Models retrain nightly at 02:00 UTC after you have ~14 days of data. You can trigger it manually too.',
      status: stepStatus(hasModel, models.isLoading),
      render: () => (
        <div className="space-y-1">
          <Link href="/models" className="link-accent text-xs">
            View models →
          </Link>
        </div>
      ),
    },
  ];

  const done = steps.filter((s) => s.status === 'done').length;
  const total = steps.length;
  const allDone = done === total;

  if (dismissed || (allDone && dismissed)) return null;

  return (
    <div className="card relative mb-8 overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-50" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                {allDone ? 'All done' : 'Getting started'}
              </span>
              <span className="text-xs text-fg-muted">
                {done} / {total} complete
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              {allDone ? 'Your workspace is fully set up.' : 'Set up your workspace in 5 steps'}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              {allDone
                ? 'Nice. You can dismiss this card — it won\'t come back.'
                : 'Follow these once and your data will start flowing into dashboards and forecasts.'}
            </p>
          </div>
          {allDone && (
            <button
              onClick={() => {
                dismissChecklist();
                setDismissed(true);
              }}
              className="btn-ghost h-8 px-2 text-xs"
            >
              Dismiss
            </button>
          )}
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>

        <ol className="mt-6 space-y-3">
          {steps.map((step, idx) => (
            <li
              key={step.id}
              className={`rounded-lg border p-4 transition ${
                step.status === 'done'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-border bg-surface/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <StatusBadge status={step.status} index={idx + 1} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`text-sm font-medium ${
                        step.status === 'done' ? 'text-fg-muted line-through' : 'text-fg'
                      }`}
                    >
                      {step.title}
                    </h3>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-muted">{step.description}</p>
                  {step.status !== 'done' && <div className="mt-3">{step.render()}</div>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function StatusBadge({ status, index }: { status: StepStatus; index: number }) {
  if (status === 'done') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (status === 'loading') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-xs text-fg-muted">
        …
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-bg/60 text-xs font-semibold text-fg-muted">
      {index}
    </span>
  );
}
