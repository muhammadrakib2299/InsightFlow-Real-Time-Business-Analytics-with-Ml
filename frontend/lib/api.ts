/**
 * Thin fetch wrapper for the InsightFlow BFF. The dashboard talks to the
 * NestJS service (NEXT_PUBLIC_API_URL) — never directly to ClickHouse or
 * the forecast service.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  // If the caller did not pass token: false-y, fall back to the stored
  // access token. Pass `token: null` explicitly to opt out (e.g. login).
  let effectiveToken: string | null | undefined = token;
  if (effectiveToken === undefined && typeof window !== 'undefined') {
    effectiveToken = window.localStorage.getItem('if.access');
  }

  const res = await fetch(url, {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...(effectiveToken ? { authorization: `Bearer ${effectiveToken}` } : {}),
      ...headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, body);
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
