'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { login } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().email('enter a valid email'),
  password: z.string().min(1, 'password required'),
});

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'invalid input');
      return;
    }
    setPending(true);
    try {
      await login(parsed.data);
      router.replace('/dashboards');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-fg-muted">Log in to your InsightFlow workspace.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm text-fg-muted">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-bg-subtle bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm text-fg-muted">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-bg-subtle bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            required
          />
        </label>

        {error && (
          <div role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-fg-muted">
        New here?{' '}
        <Link href="/signup" className="text-accent underline-offset-4 hover:underline">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
