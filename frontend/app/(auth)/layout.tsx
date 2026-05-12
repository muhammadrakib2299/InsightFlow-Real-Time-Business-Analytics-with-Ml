import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          InsightFlow
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="px-6 py-4 text-sm text-fg-muted">
        Pre-1.0 — local development build
      </footer>
    </div>
  );
}
