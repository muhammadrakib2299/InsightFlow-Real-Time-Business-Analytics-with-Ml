'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { signup } from '@/lib/auth';

const signupSchema = z.object({
  email: z.string().email('enter a valid email'),
  password: z.string().min(8, 'password must be at least 8 characters'),
  displayName: z.string().optional(),
  workspaceName: z.string().optional(),
});

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = signupSchema.safeParse({
      email,
      password,
      displayName: displayName || undefined,
      workspaceName: workspaceName || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'invalid input');
      return;
    }
    setPending(true);
    try {
      await signup(parsed.data);
      router.replace('/dashboards');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'signup failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
      <p className="mt-1 text-sm text-fg-muted">
        One account, one workspace to start. You can invite teammates later.
      </p>

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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-bg-subtle bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            minLength={8}
            required
          />
        </label>

        <label className="block">
          <span className="text-sm text-fg-muted">
            Display name <span className="text-xs">(optional)</span>
          </span>
          <input
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-md border border-bg-subtle bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="text-sm text-fg-muted">
            Workspace name <span className="text-xs">(optional)</span>
          </span>
          <input
            type="text"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Acme analytics"
            className="mt-1 w-full rounded-md border border-bg-subtle bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
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
          {pending ? 'Creating…' : 'Create workspace'}
        </button>
      </form>

      <p className="mt-6 text-sm text-fg-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
