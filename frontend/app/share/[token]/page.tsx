import { notFound } from 'next/navigation';

interface SharedDashboardResponse {
  dashboard: {
    id: string;
    name: string;
    description: string | null;
    widgets: Array<{
      id: string;
      type: string;
      title: string;
      configJson: Record<string, unknown>;
    }>;
  };
  mode: 'shared';
}

async function fetchShared(token: string): Promise<SharedDashboardResponse | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const res = await fetch(`${base}/api/share/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as SharedDashboardResponse;
}

export default async function SharedDashboard({
  params,
}: {
  params: { token: string };
}) {
  const data = await fetchShared(params.token);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Shared dashboard</p>
          <h1 className="text-2xl font-semibold tracking-tight">{data.dashboard.name}</h1>
          {data.dashboard.description && (
            <p className="mt-1 text-sm text-fg-muted">{data.dashboard.description}</p>
          )}
        </div>
        <span className="rounded-md bg-bg-subtle/60 px-2 py-1 text-xs text-fg-muted">
          read-only
        </span>
      </header>

      <p className="mt-6 text-sm text-fg-muted">
        Live widget rendering on the shared page is read-only — the widgets below
        will hydrate once you visit on a client that supports CORS reads to the
        public BFF endpoints. For the demo build we show widget metadata so the
        link still validates end-to-end:
      </p>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.dashboard.widgets.map((w) => (
          <li
            key={w.id}
            className="rounded-md border border-bg-subtle/80 bg-bg-subtle/40 px-4 py-3"
          >
            <div className="font-medium">{w.title}</div>
            <div className="text-xs text-fg-muted">{w.type}</div>
          </li>
        ))}
        {data.dashboard.widgets.length === 0 && (
          <li className="text-sm text-fg-muted">No widgets on this dashboard.</li>
        )}
      </ul>
    </main>
  );
}
