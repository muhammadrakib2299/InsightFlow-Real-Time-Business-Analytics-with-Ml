/**
 * Allowlist of metric names the BFF will aggregate against ClickHouse.
 *
 * Every metric maps to an event_name we expect in the events table plus
 * the aggregation it requires. New metrics must be added here — there is
 * no dynamic SQL composition path. The point is to make a hostile user
 * controlling `?metric=` parameter unable to influence the SQL plan.
 */

export type AggregationKind = 'sum_revenue' | 'count_events' | 'unique_users';

export interface MetricDefinition {
  /** Display name shown in the model/widget metadata. */
  label: string;
  /** Event name we aggregate in ClickHouse. */
  eventName: string;
  /** Which aggregate to read off the kpi_hourly materialized view. */
  agg: AggregationKind;
  /** Currency for monetary metrics (informational; values stay in cents). */
  currency?: string;
}

export const METRICS: Readonly<Record<string, MetricDefinition>> = Object.freeze({
  mrr: {
    label: 'Monthly recurring revenue',
    eventName: 'subscription_payment',
    agg: 'sum_revenue',
    currency: 'USD',
  },
  dau: {
    label: 'Daily active users',
    eventName: 'session_start',
    agg: 'unique_users',
  },
  signups: {
    label: 'Signups',
    eventName: 'signup',
    agg: 'count_events',
  },
  churn: {
    label: 'Churn events',
    eventName: 'subscription_cancelled',
    agg: 'count_events',
  },
  payments: {
    label: 'Payments',
    eventName: 'subscription_payment',
    agg: 'count_events',
  },
});

export function isKnownMetric(name: string): name is keyof typeof METRICS {
  return Object.prototype.hasOwnProperty.call(METRICS, name);
}
