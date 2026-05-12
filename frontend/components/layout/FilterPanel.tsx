'use client';

import { useState } from 'react';
import type { DashboardFilters } from '@/lib/filters';

const COUNTRIES = ['', 'US', 'GB', 'DE', 'FR', 'IN', 'BR', 'JP', 'AU', 'CA', 'NL'];
const DEVICES = ['', 'desktop', 'mobile', 'tablet'];
const PLANS = ['', 'starter', 'growth', 'scale'];

interface FilterPanelProps {
  value: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
}

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

function applyRange(start: string, end: string, current: DashboardFilters): DashboardFilters {
  return { ...current, from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

export function FilterPanel({ value, onChange }: FilterPanelProps) {
  const [open, setOpen] = useState(true);

  const setField = (k: keyof DashboardFilters, v: string) => onChange({ ...value, [k]: v });

  return (
    <section className="mt-6 rounded-md border border-bg-subtle/80 bg-bg-subtle/30 p-3">
      <header className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">Filters</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-accent underline-offset-4 hover:underline"
        >
          {open ? 'hide' : 'show'}
        </button>
      </header>

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="From">
            <input
              type="date"
              value={isoDate(value.from)}
              onChange={(e) => onChange(applyRange(e.target.value, isoDate(value.to), value))}
              className="w-full rounded-md border border-bg-subtle bg-bg px-2 py-1 text-sm"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={isoDate(value.to)}
              onChange={(e) => onChange(applyRange(isoDate(value.from), e.target.value, value))}
              className="w-full rounded-md border border-bg-subtle bg-bg px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Country">
            <select
              value={value.country}
              onChange={(e) => setField('country', e.target.value)}
              className="w-full rounded-md border border-bg-subtle bg-bg px-2 py-1 text-sm"
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c || 'All'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Device">
            <select
              value={value.device}
              onChange={(e) => setField('device', e.target.value)}
              className="w-full rounded-md border border-bg-subtle bg-bg px-2 py-1 text-sm"
            >
              {DEVICES.map((d) => (
                <option key={d} value={d}>
                  {d || 'All'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Plan">
            <select
              value={value.plan}
              onChange={(e) => setField('plan', e.target.value)}
              className="w-full rounded-md border border-bg-subtle bg-bg px-2 py-1 text-sm"
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p || 'All'}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-fg-muted">
      <span>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
