/**
 * Dashboard-wide filter state.
 *
 * Stored in `useState` at the dashboard level and threaded down to each
 * widget as props. Widgets that don't yet support filters (KpiTile,
 * ForecastBand, CohortHeatmap, FunnelChart) accept the prop and ignore
 * the unused fields — this keeps the widget API forward-compatible.
 */

export interface DashboardFilters {
  /** Inclusive lower bound as ISO timestamp. */
  from: string;
  /** Exclusive upper bound as ISO timestamp. */
  to: string;
  /** ISO country code (2 letters), '' = all. */
  country: string;
  /** Device category, '' = all. */
  device: string;
  /** Plan name (free-form, '' = all). */
  plan: string;
}

export function defaultFilters(windowDays = 30): DashboardFilters {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - windowDays);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    country: '',
    device: '',
    plan: '',
  };
}

export function filtersToParams(f: DashboardFilters): Record<string, string> {
  const out: Record<string, string> = { from: f.from, to: f.to };
  if (f.country) out.country = f.country;
  if (f.device) out.device = f.device;
  if (f.plan) out.plan = f.plan;
  return out;
}
