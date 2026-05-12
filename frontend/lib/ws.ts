/**
 * Socket.IO client wrapper. The BFF runs a namespace per workspace and
 * publishes a "tick" event every 5s with aggregated KPI deltas (raw events
 * are never streamed to the browser).
 */

import { io, type Socket } from 'socket.io-client';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';

export interface MetricsTick {
  workspace_id: string;
  ts: string;
  metrics: Record<string, number>;
}

export function connectWorkspace(workspaceId: string, token: string): Socket {
  const socket = io(`${WS_BASE}/ws/${workspaceId}`, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  return socket;
}
