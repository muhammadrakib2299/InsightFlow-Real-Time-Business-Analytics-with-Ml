'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { createDashboard, listDashboards } from '@/lib/dashboards';

export default function DashboardsListPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['dashboards'],
    queryFn: listDashboards,
  });

  const create = useMutation({
    mutationFn: (input: { name: string }) => createDashboard(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      setName('');
      setCreating(false);
    },
  });

  return (
    <section className="mx-auto max-w-4xl">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboards</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Your workspace's saved views. Create one to start dropping in widgets.
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white"
        >
          {creating ? 'Cancel' : 'New dashboard'}
        </button>
      </header>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate({ name: name.trim() });
          }}
          className="mt-4 flex gap-2 rounded-md border border-bg-subtle bg-bg-subtle/30 p-3"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Revenue overview"
            className="flex-1 rounded-md border border-bg-subtle bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            autoFocus
          />
          <button
            type="submit"
            disabled={create.isPending || !name.trim()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      <ul className="mt-6 space-y-2">
        {list.isLoading && <li className="text-sm text-fg-muted">Loading…</li>}
        {list.isError && (
          <li className="text-sm text-red-400">Failed to load dashboards.</li>
        )}
        {list.data?.length === 0 && (
          <li className="rounded-md border border-dashed border-bg-subtle/80 px-4 py-6 text-sm text-fg-muted">
            No dashboards yet. Create your first one above.
          </li>
        )}
        {list.data?.map((d) => (
          <li key={d.id}>
            <Link
              href={`/dashboards/${d.id}`}
              className="flex items-center justify-between rounded-md border border-bg-subtle/80 bg-bg-subtle/30 px-4 py-3 hover:border-accent"
            >
              <span>
                <span className="font-medium">{d.name}</span>
                {d.description && (
                  <span className="ml-2 text-sm text-fg-muted">{d.description}</span>
                )}
              </span>
              <span className="text-xs text-fg-muted">
                {new Date(d.updatedAt).toLocaleDateString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
