'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { GettingStartedCard } from '@/components/onboarding/GettingStartedCard';
import { createDashboard, listDashboards } from '@/lib/dashboards';

export default function DashboardsListPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const list = useQuery({
    queryKey: ['dashboards'],
    queryFn: listDashboards,
  });

  const create = useMutation({
    mutationFn: (input: { name: string; description?: string }) => createDashboard(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      setName('');
      setDescription('');
      setCreating(false);
    },
  });

  useEffect(() => {
    if (creating) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [creating]);

  return (
    <section className="mx-auto max-w-4xl">
      <GettingStartedCard onCreateDashboard={() => setCreating(true)} />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboards</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Saved views for your workspace. Each dashboard is a canvas — add KPI
            tiles, charts, funnels, and forecasts.
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="btn-primary h-9 px-3 text-sm self-start"
        >
          {creating ? 'Cancel' : '+ New dashboard'}
        </button>
      </header>

      {creating && (
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              create.mutate({
                name: name.trim(),
                description: description.trim() || undefined,
              });
            }
          }}
          className="card mt-4 grid gap-3 p-4 sm:grid-cols-3"
        >
          <label className="sm:col-span-1">
            <span className="label">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Revenue overview"
              className="input mt-1"
              autoFocus
              required
            />
          </label>
          <label className="sm:col-span-2">
            <span className="label">Description (optional)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="MRR, churn, signups"
              className="input mt-1"
            />
          </label>
          <div className="sm:col-span-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={create.isPending || !name.trim()}
              className="btn-primary h-9 px-4 text-sm"
            >
              {create.isPending ? 'Creating…' : 'Create dashboard'}
            </button>
            {create.isError && (
              <span className="text-xs text-red-400">
                Failed to create. Check the API logs.
              </span>
            )}
          </div>
        </form>
      )}

      <div className="mt-8">
        {list.isLoading && (
          <div className="card flex items-center gap-2 p-4 text-sm text-fg-muted">
            <Spinner /> Loading dashboards…
          </div>
        )}
        {list.isError && (
          <div className="card border-red-500/30 p-4 text-sm text-red-400">
            Failed to load dashboards. Make sure the API is running on{' '}
            <code className="font-mono">localhost:4000</code>.
          </div>
        )}
        {list.data && list.data.length === 0 && (
          <EmptyState onCreate={() => setCreating(true)} />
        )}
        {list.data && list.data.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.data.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/dashboards/${d.id}`}
                  className="card group flex h-full flex-col gap-2 p-4 transition hover:border-accent/60 hover:shadow-glow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-fg">{d.name}</span>
                    <span className="chip text-[10px]">
                      {(d.layoutJson?.length ?? 0)} widget
                      {(d.layoutJson?.length ?? 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                  {d.description && (
                    <p className="line-clamp-2 text-xs text-fg-muted">{d.description}</p>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-2 text-[11px] text-fg-muted">
                    <span>Updated {new Date(d.updatedAt).toLocaleDateString()}</span>
                    <span className="text-accent opacity-0 transition group-hover:opacity-100">
                      Open →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      </div>
      <div>
        <h3 className="text-base font-medium">No dashboards yet</h3>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">
          Create your first dashboard to start dropping in KPI tiles, charts, and forecast widgets.
        </p>
      </div>
      <button onClick={onCreate} className="btn-primary h-9 px-4 text-sm">
        + Create dashboard
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-fg-muted"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
