# frontend — Next.js 14 dashboard

App Router + TypeScript + Tailwind + Recharts. Live updates via Socket.IO client subscribed to per-workspace channels on the `api` service.

**Routes**

- `/login`, `/signup`, `/forgot-password`
- `/dashboards` — list
- `/dashboards/[id]` — viewer with drag-resize widget grid (react-grid-layout)
- `/dashboards/[id]/edit` — builder
- `/share/[token]` — read-only signed-token public link
- `/settings/workspace`, `/settings/api-keys`, `/settings/alerts`

**Widgets** (`components/widgets/`)

- `KpiTile` — single metric, "Live" pulse dot, optional sparkline
- `ForecastBand` — historical line + Prophet `yhat` + shaded `yhat_lower..yhat_upper`
- `CohortHeatmap` — signup-week × activity-week grid (custom Recharts cell)
- `FunnelChart` — drop-off bars + per-step conversion
- `AlertConfig` — inline editor

**State + data**

- React Query for fetches
- Zustand for ephemeral UI state (filters, drag state)
- Socket.IO client in `lib/ws.ts`, REST client in `lib/api.ts`
