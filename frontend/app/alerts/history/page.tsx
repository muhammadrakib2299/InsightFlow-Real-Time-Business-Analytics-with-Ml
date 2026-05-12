'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { alertHistory } from '@/lib/alerts';

export default function AlertHistoryPage() {
  const history = useQuery({ queryKey: ['alert-history'], queryFn: alertHistory });

  return (
    <section className="mx-auto max-w-4xl">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alert history</h1>
          <p className="mt-1 text-sm text-fg-muted">Most recent 50 fires.</p>
        </div>
        <Link href="/alerts" className="text-sm text-accent underline-offset-4 hover:underline">
          ← Back to alerts
        </Link>
      </header>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-bg-subtle text-left text-xs uppercase tracking-wide text-fg-muted">
            <th className="py-2">When</th>
            <th className="py-2">Alert</th>
            <th className="py-2">Metric</th>
            <th className="py-2">Value</th>
            <th className="py-2">Expected</th>
          </tr>
        </thead>
        <tbody>
          {history.data?.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-fg-muted">
                No alerts have fired yet.
              </td>
            </tr>
          )}
          {history.data?.map((e) => (
            <tr key={e.id} className="border-b border-bg-subtle/40 last:border-0">
              <td className="py-2">{new Date(e.firedAt).toLocaleString()}</td>
              <td className="py-2">{e.alert?.name ?? '—'}</td>
              <td className="py-2 text-fg-muted">{e.alert?.metric ?? '—'}</td>
              <td className="py-2">{e.value}</td>
              <td className="py-2 text-fg-muted">{e.expected ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
