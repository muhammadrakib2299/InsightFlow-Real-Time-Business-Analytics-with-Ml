import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">InsightFlow</h1>
        <p className="mt-2 text-fg-muted">
          Real-time business analytics with ML forecasting. Self-hostable, multi-tenant,
          and built to run on a single $5/month VPS.
        </p>
      </header>

      <section className="space-y-6">
        <Feature title="Ingest in real time">
          REST + SDK → Kafka → ClickHouse with 1-second micro-batches.
        </Feature>
        <Feature title="Forecast revenue, churn, demand">
          Prophet primary, ARIMA baseline. Nightly retrain, MAPE shown in the model card.
        </Feature>
        <Feature title="Alert on anomalies">
          Rolling Z-score and IQR detectors → email, Slack, webhook.
        </Feature>
        <Feature title="Export everything">
          One-click branded PDFs. Signed share links for read-only dashboards.
        </Feature>
      </section>

      <footer className="mt-16 flex items-center gap-4 text-sm text-fg-muted">
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Log in
        </Link>
        <Link href="/signup" className="text-accent underline-offset-4 hover:underline">
          Create workspace
        </Link>
        <span className="ml-auto">v0.1.0 · pre-1.0</span>
      </footer>
    </main>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-bg-subtle/80 bg-bg-subtle/40 p-5">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mt-1 text-sm text-fg-muted">{children}</p>
    </div>
  );
}
