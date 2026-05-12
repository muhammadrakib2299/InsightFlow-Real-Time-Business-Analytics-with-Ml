'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getActiveWorkspace, logout } from '@/lib/auth';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setWorkspace(getActiveWorkspace());
  }, []);

  const onLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-6 border-b border-bg-subtle/80 bg-bg/90 px-6 py-3 backdrop-blur">
        <Link href="/dashboards" className="text-base font-semibold tracking-tight">
          InsightFlow
        </Link>
        <nav className="flex gap-4 text-sm text-fg-muted">
          <Link href="/dashboards" className="hover:text-fg">
            Dashboards
          </Link>
          <Link href="/models" className="hover:text-fg">
            Models
          </Link>
          <Link href="/alerts" className="hover:text-fg">
            Alerts
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-fg-muted">
          {workspace && <span className="hidden sm:inline">{workspace.name}</span>}
          <button
            onClick={onLogout}
            className="rounded-md border border-bg-subtle px-2 py-1 hover:text-fg"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
