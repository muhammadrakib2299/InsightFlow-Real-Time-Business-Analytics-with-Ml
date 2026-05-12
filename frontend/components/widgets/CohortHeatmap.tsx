'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getActiveWorkspace } from '@/lib/auth';

interface CohortRow {
  signup_day: string;
  cohort_size: number;
  weeks: number[];
}

interface CohortResponse {
  cohorts: CohortRow[];
  cache: { hit: boolean; ttlSeconds: number };
}

interface CohortHeatmapProps {
  title: string;
  windowDays?: number;
}

async function fetchCohorts(windowDays: number): Promise<CohortResponse> {
  const ws = getActiveWorkspace();
  if (!ws) throw new Error('no active workspace');
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - windowDays);
  const qs = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return apiFetch<CohortResponse>(
    `/api/workspaces/${ws.id}/events/cohort?${qs.toString()}`,
  );
}

function cellColor(value: number, max: number, mode: 'count' | 'retention'): string {
  if (max <= 0) return 'rgb(var(--bg-subtle))';
  const ratio = Math.min(1, value / max);
  // Tailwind-ish blue ramp via CSS vars
  const alpha = mode === 'retention' ? Math.max(0.06, ratio) : Math.max(0.06, Math.pow(ratio, 0.6));
  return `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
}

export function CohortHeatmap({ title, windowDays = 84 }: CohortHeatmapProps) {
  const [mode, setMode] = useState<'count' | 'retention'>('retention');
  const query = useQuery({
    queryKey: ['cohort', windowDays],
    queryFn: () => fetchCohorts(windowDays),
    staleTime: 60_000,
  });

  const cohorts = query.data?.cohorts ?? [];
  const maxCount = cohorts.reduce(
    (m, c) => Math.max(m, ...c.weeks.slice(1)),
    0,
  );

  return (
    <article className="rounded-lg border border-bg-subtle/80 bg-bg-subtle/40 p-4">
      <header className="flex items-baseline justify-between text-sm">
        <h3 className="font-medium">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <button
            className={mode === 'retention' ? 'text-fg underline' : 'hover:text-fg'}
            onClick={() => setMode('retention')}
          >
            retention %
          </button>
          <span>·</span>
          <button
            className={mode === 'count' ? 'text-fg underline' : 'hover:text-fg'}
            onClick={() => setMode('count')}
          >
            counts
          </button>
        </div>
      </header>

      {query.isLoading && <p className="mt-4 text-sm text-fg-muted">Loading…</p>}
      {query.isError && (
        <p className="mt-4 text-sm text-red-400">Failed to load cohort data.</p>
      )}
      {cohorts.length === 0 && !query.isLoading && (
        <p className="mt-4 text-sm text-fg-muted">No cohort data in window.</p>
      )}

      {cohorts.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="text-fg-muted">
                <th className="px-2 py-1 text-left">Cohort</th>
                <th className="px-2 py-1 text-right">Size</th>
                {Array.from({ length: 13 }, (_, i) => (
                  <th key={i} className="px-2 py-1 text-center">
                    W{i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((row) => (
                <tr key={row.signup_day}>
                  <td className="whitespace-nowrap px-2 py-1 text-fg-muted">
                    {row.signup_day.slice(0, 10)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-right text-fg-muted">
                    {row.cohort_size}
                  </td>
                  {row.weeks.map((v, i) => {
                    const display =
                      mode === 'retention' && row.cohort_size > 0
                        ? `${Math.round((v / row.cohort_size) * 100)}%`
                        : v > 0
                          ? String(v)
                          : '';
                    return (
                      <td
                        key={i}
                        className="px-2 py-1 text-center"
                        style={{
                          background:
                            mode === 'retention'
                              ? cellColor(v, row.cohort_size, 'retention')
                              : cellColor(v, maxCount, 'count'),
                        }}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
