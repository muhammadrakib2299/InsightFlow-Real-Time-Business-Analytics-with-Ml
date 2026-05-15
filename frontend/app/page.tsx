import Link from 'next/link';
import { Logo, LogoMark } from '@/components/brand/Logo';

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-grid opacity-60" />

      <Nav />

      <main className="relative">
        <Hero />
        <Features />
        <Stack />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="relative z-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          <a href="#features" className="btn-ghost">Features</a>
          <a href="#stack" className="btn-ghost">Stack</a>
          <a
            href="https://github.com/muhammadrakib2299/InsightFlow-Real-Time-Business-Analytics-with-Ml"
            className="btn-ghost"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost">Log in</Link>
          <Link href="/signup" className="btn-primary">Get started</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 pt-12 pb-24 md:pt-20">
      <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="flex flex-col justify-center">
          <span className="chip w-fit">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 pulse-dot" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            v0.1 · open source · self-hostable
          </span>

          <h1 className="mt-5 text-balance text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Real-time analytics with{' '}
            <span className="text-gradient">forecasts built in</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
            Ingest events at sub-second latency, watch your KPIs update live, and let Prophet
            and ARIMA project the next 30, 60, and 90 days — all on a single VPS.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="btn-primary h-11 px-5">
              Create workspace
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Link href="/login" className="btn-secondary h-11 px-5">
              Log in
            </Link>
            <a
              href="https://github.com/muhammadrakib2299/InsightFlow-Real-Time-Business-Analytics-with-Ml"
              className="btn-ghost h-11"
              target="_blank"
              rel="noreferrer"
            >
              <GithubIcon className="h-4 w-4" />
              Star on GitHub
            </a>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-border pt-6">
            <Stat label="Write latency" value="<1s" />
            <Stat label="Forecast horizons" value="30/60/90d" />
            <Stat label="Runs on" value="$5 VPS" />
          </dl>
        </div>

        <ProductPreview />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 font-mono text-xl font-semibold text-fg">{value}</dd>
    </div>
  );
}

function ProductPreview() {
  // Static visual that hints at the product: KPI tile + forecast band sparkline.
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-accent/20 via-accent-2/10 to-transparent blur-2xl"
      />
      <div className="card p-5 shadow-glow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-fg-muted">
              Monthly Recurring Revenue
            </span>
            <span className="chip">live</span>
          </div>
          <span className="text-xs text-fg-muted">last 90d · 60d forecast</span>
        </div>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="font-mono text-4xl font-semibold tracking-tight">$48.2k</span>
          <span className="text-sm font-medium text-emerald-400">+12.4%</span>
        </div>

        <svg
          viewBox="0 0 400 140"
          className="mt-5 h-40 w-full"
          aria-hidden
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="hero-line" x1="0" y1="0" x2="400" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgb(var(--accent))" />
              <stop offset="100%" stopColor="rgb(var(--accent-2))" />
            </linearGradient>
            <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
            </linearGradient>
            <pattern id="grid-p" width="40" height="28" patternUnits="userSpaceOnUse">
              <path d="M40 0 L0 0 0 28" fill="none" stroke="rgb(var(--border))" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="400" height="140" fill="url(#grid-p)" />

          {/* Forecast confidence band */}
          <path
            d="M260 70 Q300 50 340 35 Q360 28 400 18 L400 60 Q360 70 340 78 Q300 88 260 95 Z"
            fill="rgb(var(--accent-2))"
            opacity="0.18"
          />
          {/* Forecast median (dashed) */}
          <path
            d="M260 80 Q300 62 340 50 Q370 42 400 32"
            fill="none"
            stroke="rgb(var(--accent-2))"
            strokeWidth="2"
            strokeDasharray="4 4"
            strokeLinecap="round"
          />

          {/* Historical area */}
          <path
            d="M0 120 L20 110 L40 115 L60 100 L80 105 L100 90 L120 95 L140 80 L160 88 L180 70 L200 78 L220 60 L240 70 L260 55 L260 140 L0 140 Z"
            fill="url(#hero-fill)"
          />
          {/* Historical line */}
          <path
            d="M0 120 L20 110 L40 115 L60 100 L80 105 L100 90 L120 95 L140 80 L160 88 L180 70 L200 78 L220 60 L240 70 L260 55"
            fill="none"
            stroke="url(#hero-line)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Split marker */}
          <line x1="260" y1="0" x2="260" y2="140" stroke="rgb(var(--border))" strokeDasharray="2 4" />
          <circle cx="260" cy="55" r="3.5" fill="rgb(var(--accent))" />
        </svg>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <MiniTile label="ARPU" value="$42" trend="+3.1%" />
          <MiniTile label="Churn" value="2.4%" trend="-0.4%" good />
          <MiniTile label="DAU/MAU" value="36%" trend="+1.8%" good />
        </div>
      </div>
    </div>
  );
}

function MiniTile({
  label,
  value,
  trend,
  good = true,
}: {
  label: string;
  value: string;
  trend: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-subtle/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="font-mono text-lg font-semibold">{value}</span>
        <span className={`text-xs font-medium ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
          {trend}
        </span>
      </div>
    </div>
  );
}

function Features() {
  const items = [
    {
      icon: BoltIcon,
      title: 'Sub-second ingestion',
      desc: 'REST + SDK + webhooks → Kafka → ClickHouse with idempotent micro-batched writes.',
    },
    {
      icon: TrendUpIcon,
      title: 'Forecasts as first-class',
      desc: 'Prophet primary, ARIMA baseline. Nightly retrain with MAPE tracked on every model.',
    },
    {
      icon: BellIcon,
      title: 'Anomaly alerts in minutes',
      desc: 'Rolling Z-score and IQR detectors fan out to email, Slack, and generic webhooks.',
    },
    {
      icon: LayersIcon,
      title: 'Cohorts & funnels',
      desc: 'Retention heatmaps, multi-step funnels, drill-downs by geo / device / plan / segment.',
    },
    {
      icon: FileIcon,
      title: 'One-click PDF export',
      desc: 'Branded reports rendered with Puppeteer, queued via BullMQ, archived to S3.',
    },
    {
      icon: LockIcon,
      title: 'Self-hosted, multi-tenant',
      desc: 'Row-level isolation across ClickHouse and Postgres. Your data never leaves your infra.',
    },
  ];
  return (
    <section id="features" className="relative mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Everything an operator needs to see where the line is going.
        </h2>
        <p className="mt-3 text-fg-muted">
          Closed BI tools cost four figures per seat and ship without forecasting. InsightFlow
          pairs a streaming OLAP pipeline with auto-trained models — open source.
        </p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => (
          <div key={f.title} className="card p-6 transition hover:border-accent/40">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-fg">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stack() {
  const stack = [
    'Next.js 14',
    'NestJS',
    'FastAPI',
    'ClickHouse',
    'Kafka (Redpanda)',
    'Postgres',
    'Redis',
    'Prophet',
    'ARIMA',
    'Caddy',
    'Docker Compose',
  ];
  return (
    <section id="stack" className="relative mx-auto max-w-6xl px-6 pb-16">
      <div className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold">A modern streaming-OLAP stack you can fork.</h3>
          <p className="mt-1 text-sm text-fg-muted">
            ADRs in the repo document every trade-off — ClickHouse vs Timescale, Kafka vs Redis
            Streams, Prophet vs ARIMA.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stack.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 pb-24">
      <div className="card relative overflow-hidden p-10 text-center">
        <div className="pointer-events-none absolute -inset-1 bg-hero-glow opacity-80" />
        <div className="relative">
          <LogoMark className="mx-auto h-10 w-10" />
          <h3 className="mt-4 text-3xl font-semibold tracking-tight">
            Spin up your workspace in 60 seconds.
          </h3>
          <p className="mx-auto mt-3 max-w-xl text-fg-muted">
            Free, MIT-licensed, and yours to run. No credit card, no seat fees, no data egress.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/signup" className="btn-primary h-11 px-5">
              Create workspace
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            <Link href="/login" className="btn-secondary h-11 px-5">
              I already have one
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 text-sm text-fg-muted md:flex-row md:items-center">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-5 w-5" />
          <span>InsightFlow · MIT licensed · v0.1.0</span>
        </div>
        <div className="flex items-center gap-5">
          <a
            href="https://github.com/muhammadrakib2299/InsightFlow-Real-Time-Business-Analytics-with-Ml"
            className="hover:text-fg"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <Link href="/login" className="hover:text-fg">
            Log in
          </Link>
          <Link href="/signup" className="hover:text-fg">
            Sign up
          </Link>
        </div>
      </div>
    </footer>
  );
}

/* ---------- Inline icons (no extra deps) ---------- */
type IconProps = { className?: string };
function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GithubIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.63 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.32-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.17 1.18a11.1 11.1 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
function BoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}
function TrendUpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M3 17l6-6 4 4 8-8M14 7h7v7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
function LayersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="m3 13 9 5 9-5M3 18l9 5 9-5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}
function FileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M14 3v5h5M9 14h6M9 17h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
function LockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
