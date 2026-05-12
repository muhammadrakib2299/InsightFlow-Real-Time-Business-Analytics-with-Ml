'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AlertToaster } from '@/components/layout/AlertToaster';
import { getAccessToken } from '@/lib/auth';

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;
  return (
    <AppShell>
      {children}
      <AlertToaster />
    </AppShell>
  );
}
