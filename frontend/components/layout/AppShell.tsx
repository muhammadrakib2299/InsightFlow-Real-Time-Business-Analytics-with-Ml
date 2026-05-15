'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getActiveWorkspace, logout } from '@/lib/auth';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

const NAV = [
  { href: '/dashboards', label: 'Dashboards' },
  { href: '/models', label: 'Models' },
  { href: '/alerts', label: 'Alerts' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href="/dashboards" className="flex items-center gap-2">
            <span
              className="inline-block h-5 w-5 rounded bg-gradient-to-br from-accent to-accent-2 shadow-glow"
              aria-hidden="true"
            />
            <span className="text-base font-semibold tracking-tight">InsightFlow</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-surface text-fg shadow-sm'
                      : 'text-fg-muted hover:bg-surface/60 hover:text-fg'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {workspace && (
              <span
                className="hidden items-center gap-2 rounded-md border border-border bg-surface/60 px-2.5 py-1 text-xs text-fg-muted sm:inline-flex"
                title={`Workspace: ${workspace.name}`}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot"
                  aria-hidden="true"
                />
                {workspace.name}
              </span>
            )}
            <ThemeToggle />
            <button
              onClick={onLogout}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg-muted transition hover:text-fg hover:bg-surface/60"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 border-t border-border px-4 py-2 md:hidden">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition ${
                  active ? 'bg-surface text-fg' : 'text-fg-muted'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
