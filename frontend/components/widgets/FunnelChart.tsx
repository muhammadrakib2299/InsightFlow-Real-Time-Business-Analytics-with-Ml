'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getActiveWorkspace } from '@/lib/auth';

interface FunnelStep {
  name: string;
  reached: number;
  conversion: number;
}

interface FunnelResponse {
  steps: FunnelStep[];
  cache: { hit: boolean; ttlSeconds: number };
}

interface FunnelChartProps {
  title: string;
  steps: string[]; // ordered event_names
  windowHours?: number;
  windowDays?: number;
}

async function fetchFunnel(
  steps: string[],
  windowDays: number,
  windowHours: number,
): Promise<FunnelResponse> {
  const ws = getActiveWorkspace();
  if (!ws) throw new Error('no active workspace');
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - windowDays);
  const qs = new URLSearchParams({
    steps: steps.join(','),
    from: from.toISOString(),
    to: to.toISOString(),
    windowHours: String(windowHours),
  });
  return apiFetch<FunnelResponse>(
    `/api/workspaces/${ws.id}/events/funnel?${qs.toString()}`,
  );
}

export function FunnelChart({
  title,
  steps,
  windowHours = 24 * 7,
  windowDays = 30,
}: FunnelChartProps) {
  const query = useQuery({
    queryKey: ['funnel', steps.join(','), windowHours, windowDays],
    queryFn: () => fetchFunnel(steps, windowDays, windowHours),
    staleTime: 60_000,
  });

  const data = query.data?.steps ?? [];
  const max = data[0]?.reached ?? 0;

  return (
    <article className="rounded-lg border border-bg-subtle/80 bg-bg-subtle/40 p-4">
      <header className="flex items-baseline justify-between text-sm">
        <h3 className="font-medium">{title}</h3>
        <span className="text-xs text-fg-muted">
          {windowDays}d window · {windowHours}h step gap
        </span>
      </header>

      {query.isLoading && <p className="mt-4 text-sm text-fg-muted">Loading…</p>}
      {query.isError && <p className="mt-4 text-sm text-red-400">Failed to load funnel.</p>}

      <div className="mt-4 space-y-2">
        {data.map((s, i) => {
          const widthPct = max > 0 ? (s.reached / max) * 100 : 0;
          const dropPct =
            i > 0 && data[i - 1].reached > 0
              ? ((data[i - 1].reached - s.reached) / data[i - 1].reached) * 100
              : 0;
          return (
            <div key={s.name}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium">
                  {i + 1}. {s.name}
                </span>
                <span className="text-fg-muted">
                  {s.reached.toLocaleString()} · {(s.conversion * 100).toFixed(1)}%
                  {i > 0 && dropPct > 0 && (
                    <span className="ml-2 text-red-400">−{dropPct.toFixed(1)}%</span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-6 overflow-hidden rounded bg-bg-subtle">
                <div
                  className="h-full rounded bg-accent/80"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
