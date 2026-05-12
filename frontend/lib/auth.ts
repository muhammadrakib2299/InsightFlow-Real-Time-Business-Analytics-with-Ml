/**
 * Client-side auth state. Tokens live in localStorage for v1 — moving them
 * to HttpOnly cookies served by the Next.js route handler is on the
 * security hardening list for M6.
 */

import { apiFetch } from './api';

const ACCESS_KEY = 'if.access';
const REFRESH_KEY = 'if.refresh';
const WORKSPACE_KEY = 'if.workspace';

export interface AuthSession {
  user: { id: string; email: string; displayName: string | null };
  workspace: { id: string; name: string; slug: string };
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessExpiresIn: number;
    refreshExpiresIn: number;
  };
}

function isBrowser() {
  return typeof window !== 'undefined';
}

export function storeSession(session: AuthSession): void {
  if (!isBrowser()) return;
  localStorage.setItem(ACCESS_KEY, session.tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, session.tokens.refreshToken);
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(session.workspace));
}

export function clearSession(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getActiveWorkspace(): AuthSession['workspace'] | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(WORKSPACE_KEY);
  return raw ? (JSON.parse(raw) as AuthSession['workspace']) : null;
}

export async function signup(input: {
  email: string;
  password: string;
  displayName?: string;
  workspaceName?: string;
}): Promise<AuthSession> {
  const session = await apiFetch<AuthSession>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  storeSession(session);
  return session;
}

export async function login(input: { email: string; password: string }): Promise<AuthSession> {
  const session = await apiFetch<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  storeSession(session);
  return session;
}

export async function refresh(): Promise<AuthSession['tokens'] | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const res = await apiFetch<{ tokens: AuthSession['tokens'] }>('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  if (isBrowser()) {
    localStorage.setItem(ACCESS_KEY, res.tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, res.tokens.refreshToken);
  }
  return res.tokens;
}

export function logout(): void {
  clearSession();
}
