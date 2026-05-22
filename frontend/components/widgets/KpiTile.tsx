'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { fetchKpi, type KpiSeries } from '@/lib/dashboards';
import { getAccessToken, getActiveWorkspace } from '@/lib/auth';
import { connectWorkspace } from '@/lib/ws';

interface KpiTileProps {
  metric: string;
  title: string;
  windowDays?: number;
}

function formatValue(series: KpiSeries | undefined, fallbackUnit?: string): string {
  if (!series || series.points.length === 0) return '—';
  const total = series.points.reduce((acc, p) => acc + p.value, 0);
  switch (series.unit) {
    case 'cents': {
      const dollars = total / 100;
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(dollars);
    }
    case 'users':
    case 'count':
    default:
      return new Intl.NumberFormat().format(Math.round(total));
  }
  return fallbackUnit ?? '—';
}

export function KpiTile({ metric, title, windowDays = 30 }: KpiTileProps) {
  const [pulse, setPulse] = useState(false);

  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - windowDays);

  const query = useQuery({
    queryKey: ['kpi', metric, windowDays, from.toISOString(), now.toISOString()],
    queryFn: () =>
      fetchKpi({
        metric,
        from: from.toISOString(),
        to: now.toISOString(),
        granularity: 'day',
      }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ws = getActiveWorkspace();
    const token = getAccessToken();
    if (!ws || !token) return;
    let socket: Socket | null = null;
    try {
      socket = connectWorkspace(ws.id, token);
      socket.on('tick', () => {
        setPulse(true);
        setTimeout(() => setPulse(false), 400);
      });
    } catch {
      // socket optional — tile still works on polling
    }
    return () => {
      socket?.disconnect();
    };
  }, []);

  const value = query.isLoading
    ? null
    : query.isError
      ? 'error'
      : formatValue(query.data);

  return (
    <article className="card group relative flex h-full flex-col gap-4 p-5 transition hover:border-accent/40">
      <header className="flex items-start justify-between gap-2">
        <h3 className="label">{title}</h3>
        <span
          aria-label={pulse ? 'live update' : 'idle'}
          className={`mt-0.5 h-1.5 w-1.5 rounded-full transition-colors ${
            pulse ? 'bg-emerald-400 pulse-dot' : 'bg-fg-muted/40'
          }`}
        />
      </header>
      <div className="flex items-baseline gap-2">
        {value === null ? (
          <div className="h-9 w-28 animate-pulse rounded-md bg-fg-muted/10" />
        ) : value === 'error' ? (
          <span className="text-2xl font-semibold text-red-400">—</span>
        ) : (
          <span className="text-3xl font-bold tracking-tight tabular-nums text-fg">
            {value}
          </span>
        )}
      </div>
      <footer className="flex items-center justify-between text-[11px] uppercase tracking-wider text-fg-muted">
        <span>Last {windowDays} days</span>
        {query.data?.cache.hit && (
          <span className="rounded-full bg-fg-muted/10 px-2 py-0.5 normal-case tracking-normal">
            cached
          </span>
        )}
      </footer>
    </article>
  );
}
