import { apiFetch } from './api';
import { getActiveWorkspace } from './auth';

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface IssuedApiKey {
  id: string;
  prefix: string;
  secret: string;
  name: string;
  scopes: string[];
  createdAt: string;
  _warning?: string;
}

function workspaceBase(): string {
  const ws = getActiveWorkspace();
  if (!ws) throw new Error('no active workspace');
  return `/api/workspaces/${ws.id}`;
}

export async function listApiKeys(): Promise<ApiKeySummary[]> {
  return apiFetch<ApiKeySummary[]>(`${workspaceBase()}/api-keys`);
}

export async function createApiKey(input: { name: string }): Promise<IssuedApiKey> {
  return apiFetch<IssuedApiKey>(`${workspaceBase()}/api-keys`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
