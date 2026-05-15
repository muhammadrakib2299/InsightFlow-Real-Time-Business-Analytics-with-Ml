'use client';

import { useEffect, useState } from 'react';
import { applyTheme, getInitialTheme, setTheme, type Theme } from '@/lib/theme';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setLocal] = useState<Theme | null>(null);

  useEffect(() => {
    const t = getInitialTheme();
    applyTheme(t);
    setLocal(t);
  }, []);

  if (!theme) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-fg-muted ${className}`}
      >
        <span className="block h-4 w-4" />
      </button>
    );
  }

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const onClick = () => {
    setTheme(next);
    setLocal(next);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-fg-muted transition hover:text-fg hover:bg-surface/60 focus:outline-none focus:ring-2 focus:ring-accent/40 ${className}`}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
