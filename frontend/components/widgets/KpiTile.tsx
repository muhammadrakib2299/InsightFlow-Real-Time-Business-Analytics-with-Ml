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

  return (
    <article className="flex h-full flex-col justify-between rounded-lg border border-bg-subtle/80 bg-bg-subtle/40 p-4">
      <header className="flex items-center justify-between text-sm text-fg-muted">
        <h3>{title}</h3>
        <span
          aria-label={pulse ? 'live update' : 'idle'}
          className={`h-2 w-2 rounded-full transition-colors ${
            pulse ? 'bg-emerald-400' : 'bg-fg-muted/40'
          }`}
        />
      </header>
      <div className="mt-3 text-3xl font-semibold tracking-tight">
        {query.isLoading ? '…' : query.isError ? '!' : formatValue(query.data)}
      </div>
      <footer className="mt-2 text-xs text-fg-muted">
        last {windowDays} days
        {query.data?.cache.hit ? ' · cached' : ''}
      </footer>
    </article>
  );
}
