'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  createAlert,
  deleteAlert,
  listAlerts,
  toggleAlert,
  type Alert,
  type AlertChannel,
} from '@/lib/alerts';

const METRICS = ['mrr', 'dau', 'signups', 'churn', 'payments'];

export default function AlertsPage() {
  const qc = useQueryClient();
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: listAlerts });
  const [adding, setAdding] = useState(false);

  const [name, setName] = useState('');
  const [metric, setMetric] = useState('mrr');
  const [method, setMethod] = useState<'zscore' | 'iqr'>('zscore');
  const [threshold, setThreshold] = useState(3);
  const [windowDays, setWindowDays] = useState(7);
  const [emailTo, setEmailTo] = useState('');
  const [slackWebhook, setSlackWebhook] = useState('');

  const create = useMutation({
    mutationFn: async () => {
      const channels: AlertChannel[] = [];
      if (emailTo) channels.push({ type: 'email', config: { to: emailTo } });
      if (slackWebhook) channels.push({ type: 'slack', config: { webhookUrl: slackWebhook } });
      return createAlert({
        name,
        metric,
        method,
        thresholdParams: { threshold, windowDays },
        channels,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      setAdding(false);
      setName('');
      setEmailTo('');
      setSlackWebhook('');
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleAlert(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  return (
    <section className="mx-auto max-w-4xl">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Z-score and IQR detectors run every 5 minutes against your metrics.
            When they fire, notifications go out to email and/or Slack.{' '}
            <Link href="/alerts/history" className="link-accent">
              View history →
            </Link>
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="btn-primary h-9 px-3 text-sm self-start"
        >
          {adding ? 'Cancel' : '+ New alert'}
        </button>
      </header>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
          className="card mt-4 grid gap-3 p-4 sm:grid-cols-2"
        >
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="MRR drop"
              required
            />
          </Field>
          <Field label="Metric">
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="input">
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Method">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as 'zscore' | 'iqr')}
              className="input"
            >
              <option value="zscore">z-score</option>
              <option value="iqr">IQR</option>
            </select>
          </Field>
          <Field label={method === 'zscore' ? 'Threshold (|z|)' : 'IQR multiplier'}>
            <input
              type="number"
              step="0.1"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Window (days)">
            <input
              type="number"
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
              className="input"
            />
          </Field>
          <Field label="Email recipient (optional)">
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="alerts@example.com"
              className="input"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Slack webhook URL (optional)">
              <input
                type="url"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                className="input"
              />
            </Field>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={create.isPending || !name.trim()}
              className="btn-primary h-9 px-4 text-sm"
            >
              {create.isPending ? 'Creating…' : 'Create alert'}
            </button>
            {create.isError && (
              <span className="text-xs text-red-400">Failed to create. Check the API logs.</span>
            )}
          </div>
        </form>
      )}

      <div className="mt-6">
        {alerts.isLoading && (
          <div className="card flex items-center gap-2 p-4 text-sm text-fg-muted">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
            Loading alerts…
          </div>
        )}

        {alerts.data && alerts.data.length === 0 && (
          <EmptyAlerts onCreate={() => setAdding(true)} />
        )}

        {alerts.data && alerts.data.length > 0 && (
          <ul className="space-y-2">
            {alerts.data.map((a: Alert) => (
              <li
                key={a.id}
                className="card flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <span className="chip">
                      <span className="font-mono uppercase tracking-wide">{a.metric}</span>
                    </span>
                    <span className="chip">{a.method}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                    <span>
                      {a.channelsJson.length} channel
                      {a.channelsJson.length === 1 ? '' : 's'}
                    </span>
                    {a.lastFiredAt ? (
                      <span>
                        Last fired{' '}
                        <span className="text-amber-400">
                          {new Date(a.lastFiredAt).toLocaleString()}
                        </span>
                      </span>
                    ) : (
                      <span>Never fired</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => toggle.mutate({ id: a.id, enabled: !a.enabled })}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                      a.enabled
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-border text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        a.enabled ? 'bg-emerald-400' : 'bg-fg-muted/50'
                      }`}
                    />
                    {a.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete alert "${a.name}"?`)) remove.mutate(a.id);
                    }}
                    className="rounded-md border border-border px-2.5 py-1 text-xs text-fg-muted transition hover:border-red-500/40 hover:text-red-400"
                    title="Delete alert"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptyAlerts({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>
      <div>
        <h3 className="text-base font-medium">No alerts configured</h3>
        <p className="mt-1 max-w-md text-sm text-fg-muted">
          Set up a z-score or IQR detector on any metric and get pinged on email
          or Slack when it spikes or dips outside the normal range.
        </p>
      </div>
      <button onClick={onCreate} className="btn-primary h-9 px-4 text-sm">
        + Create your first alert
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
