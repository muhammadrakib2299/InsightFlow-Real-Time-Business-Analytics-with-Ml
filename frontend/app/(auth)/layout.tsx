import { Logo, LogoMark } from '@/components/brand/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-grid opacity-50" />

      <div className="relative grid min-h-screen lg:grid-cols-2">
        {/* Left: brand panel */}
        <aside className="relative hidden flex-col justify-between border-r border-border bg-bg-subtle/40 p-10 lg:flex">
          <Logo />

          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">
              See where the line is going,{' '}
              <span className="text-gradient">not just where it has been.</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-fg-muted">
              Forecast revenue, churn, and demand alongside your live KPIs. Open source, MIT
              licensed, runs on a single VPS.
            </p>

            <ul className="mt-8 space-y-3 text-sm text-fg-muted">
              {[
                'Sub-second writes via Kafka → ClickHouse',
                'Prophet + ARIMA forecasts retrained nightly',
                'Z-score & IQR anomaly alerts',
                'Branded PDF exports out of the box',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-fg-muted">
            © {new Date().getFullYear()} InsightFlow · pre-1.0 build
          </p>
        </aside>

        {/* Right: form */}
        <section className="relative flex min-h-screen flex-col">
          <header className="flex items-center justify-between px-6 py-5 lg:hidden">
            <Logo />
          </header>
          <div className="flex flex-1 items-center justify-center px-6 py-12">
            <div className="w-full max-w-sm">
              <div className="mb-8 flex items-center gap-2.5 lg:hidden">
                <LogoMark className="h-7 w-7" />
                <span className="text-base font-semibold tracking-tight">InsightFlow</span>
              </div>
              {children}
            </div>
          </div>
          <footer className="px-6 py-4 text-center text-xs text-fg-muted">
            MIT licensed · self-hosted ·{' '}
            <a
              href="https://github.com/muhammadrakib2299/InsightFlow-Real-Time-Business-Analytics-with-Ml"
              className="link-accent"
              target="_blank"
              rel="noreferrer"
            >
              source on GitHub
            </a>
          </footer>
        </section>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="m5 12 4 4L19 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
