import './globals.css';
import type { Metadata } from 'next';
import { Providers } from './providers';
import { themeBootScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'InsightFlow — Real-time analytics with ML forecasting',
  description:
    'Open-source, self-hostable BI platform. Ingest events, forecast revenue and churn, detect anomalies, and export branded PDF reports.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
