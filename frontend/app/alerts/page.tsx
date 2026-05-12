'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Z-score and IQR detectors run every 5 minutes against your metrics.
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
        >
          {adding ? 'Cancel' : 'New alert'}
        </button>
      </header>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
          className="mt-4 grid gap-3 rounded-md border border-bg-subtle bg-bg-subtle/30 p-4 sm:grid-cols-2"
        >
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
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
              className="input"
            />
          </Field>
          <Field label="Slack webhook URL (optional)">
            <input
              type="url"
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              className="input"
            />
          </Field>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={create.isPending || !name.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {create.isPending ? 'Creating…' : 'Create alert'}
            </button>
          </div>
        </form>
      )}

      <ul className="mt-6 space-y-2">
        {alerts.isLoading && <li className="text-sm text-fg-muted">Loading…</li>}
        {alerts.data?.length === 0 && (
          <li className="rounded-md border border-dashed border-bg-subtle/80 px-4 py-6 text-sm text-fg-muted">
            No alerts yet.
          </li>
        )}
        {alerts.data?.map((a: Alert) => (
          <li
            key={a.id}
            className="flex items-center justify-between rounded-md border border-bg-subtle/80 bg-bg-subtle/30 px-4 py-3"
          >
            <div>
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-fg-muted">
                {a.metric} · {a.method} · {a.channelsJson.length} channel(s)
                {a.lastFiredAt && ` · last fired ${new Date(a.lastFiredAt).toLocaleString()}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggle.mutate({ id: a.id, enabled: !a.enabled })}
                className={`rounded-md border px-2 py-1 text-xs ${
                  a.enabled
                    ? 'border-emerald-500/40 text-emerald-400'
                    : 'border-bg-subtle text-fg-muted'
                }`}
              >
                {a.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete alert "${a.name}"?`)) remove.mutate(a.id);
                }}
                className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-400"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-fg-muted">{label}</span>
      <div className="mt-1">{children}</div>
      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          background-color: rgb(var(--bg));
          border: 1px solid rgba(0, 0, 0, 0.15);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        :global(.dark .input) {
          border-color: rgb(var(--bg-subtle));
        }
      `}</style>
    </label>
  );
}
