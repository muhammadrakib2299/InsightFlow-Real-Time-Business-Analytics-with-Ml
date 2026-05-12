'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getAccessToken, getActiveWorkspace } from '@/lib/auth';
import { connectWorkspace } from '@/lib/ws';

interface Toast {
  id: string;
  title: string;
  body: string;
  ts: number;
}

const TOAST_TTL_MS = 6000;

export function AlertToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const ws = getActiveWorkspace();
    const token = getAccessToken();
    if (!ws || !token) return;
    let socket: Socket | null = null;
    try {
      socket = connectWorkspace(ws.id, token);
      socket.on('alert', (payload: { alertName?: string; metric?: string; value?: number }) => {
        const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const title = payload.alertName ?? 'Alert fired';
        const body = `${payload.metric ?? 'metric'} = ${payload.value ?? '?'}`;
        setToasts((prev) => [...prev, { id, title, body, ts: Date.now() }]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, TOAST_TTL_MS);
      });
    } catch {
      // socket optional — toaster degrades to no-op
    }
    return () => {
      socket?.disconnect();
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto w-full max-w-sm rounded-md border border-bg-subtle bg-bg-subtle/90 px-4 py-3 text-sm shadow-lg backdrop-blur"
        >
          <div className="font-medium">{t.title}</div>
          <div className="mt-0.5 text-xs text-fg-muted">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
