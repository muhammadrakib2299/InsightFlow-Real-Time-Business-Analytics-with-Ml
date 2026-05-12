import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from '../common/clickhouse.service';
import { RedisService } from '../common/redis.service';
import { withWorkspace } from '../common/with-workspace';
import { AggregationKind, METRICS, MetricDefinition, isKnownMetric } from './metrics';

export type Granularity = 'hour' | 'day';

export interface KpiPoint {
  ts: string;
  value: number;
}

export interface KpiSeries {
  metric: string;
  label: string;
  granularity: Granularity;
  unit: 'cents' | 'count' | 'users';
  points: KpiPoint[];
  cache: { hit: boolean; ttlSeconds: number };
}

const KPI_CACHE_TTL_SECONDS = 5;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly ch: ClickHouseService,
    private readonly redis: RedisService,
  ) {}

  async kpi(
    workspaceId: string,
    metricName: string,
    fromIso: string,
    toIso: string,
    granularity: Granularity,
  ): Promise<KpiSeries> {
    if (!isKnownMetric(metricName)) {
      throw new BadRequestException(`unknown metric "${metricName}"`);
    }
    if (!['hour', 'day'].includes(granularity)) {
      throw new BadRequestException('granularity must be hour|day');
    }
    const from = this.coerceTimestamp(fromIso, 'from');
    const to = this.coerceTimestamp(toIso, 'to');
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('from must be earlier than to');
    }

    const def = METRICS[metricName];
    const cacheKey = `kpi:${workspaceId}:${metricName}:${granularity}:${from.toISOString()}:${to.toISOString()}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as KpiSeries;
      parsed.cache = { hit: true, ttlSeconds: KPI_CACHE_TTL_SECONDS };
      return parsed;
    }

    const points = await this.runAggregation(workspaceId, def, from, to, granularity);
    const series: KpiSeries = {
      metric: metricName,
      label: def.label,
      granularity,
      unit: this.unitFor(def.agg),
      points,
      cache: { hit: false, ttlSeconds: KPI_CACHE_TTL_SECONDS },
    };
    await this.redis.client.set(cacheKey, JSON.stringify(series), 'EX', KPI_CACHE_TTL_SECONDS);
    return series;
  }

  private unitFor(agg: AggregationKind): KpiSeries['unit'] {
    if (agg === 'sum_revenue') return 'cents';
    if (agg === 'unique_users') return 'users';
    return 'count';
  }

  private aggSelectExpr(agg: AggregationKind): string {
    switch (agg) {
      case 'sum_revenue':
        return 'toFloat64(sumMerge(revenue_cents))';
      case 'count_events':
        return 'toFloat64(countMerge(event_count))';
      case 'unique_users':
        return 'toFloat64(uniqMerge(unique_users))';
    }
  }

  private bucketExpr(granularity: Granularity): string {
    return granularity === 'hour' ? 'toStartOfHour(hour)' : 'toDate(hour)';
  }

  private async runAggregation(
    workspaceId: string,
    def: MetricDefinition,
    from: Date,
    to: Date,
    granularity: Granularity,
  ): Promise<KpiPoint[]> {
    const sql = `
      SELECT
        ${this.bucketExpr(granularity)} AS ts,
        ${this.aggSelectExpr(def.agg)} AS value
      FROM kpi_hourly
      WHERE workspace_id = {workspace_id:UUID}
        AND event_name   = {event_name:String}
        AND hour >= {from:DateTime}
        AND hour <  {to:DateTime}
      GROUP BY ts
      ORDER BY ts
    `;

    return withWorkspace(this.ch, workspaceId, async (q) => {
      const res = await q.query({
        query: sql,
        query_params: {
          event_name: def.eventName,
          from: from.toISOString().replace('T', ' ').slice(0, 19),
          to: to.toISOString().replace('T', ' ').slice(0, 19),
        },
        format: 'JSONEachRow',
      });
      const rows = (await res.json()) as Array<{ ts: string; value: number | string }>;
      return rows.map((r) => ({ ts: r.ts, value: Number(r.value) }));
    });
  }

  private coerceTimestamp(input: string, label: string): Date {
    if (!input) throw new BadRequestException(`${label} required`);
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${label} is not a valid ISO timestamp`);
    }
    return d;
  }

  async cohort(
    workspaceId: string,
    fromIso: string,
    toIso: string,
  ): Promise<{
    cohorts: Array<{ signup_day: string; cohort_size: number; weeks: number[] }>;
    cache: { hit: boolean; ttlSeconds: number };
  }> {
    const from = this.coerceTimestamp(fromIso, 'from');
    const to = this.coerceTimestamp(toIso, 'to');
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('from must be earlier than to');
    }

    const cacheKey = `cohort:${workspaceId}:${from.toISOString()}:${to.toISOString()}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as Awaited<ReturnType<EventsService['cohort']>>;
      parsed.cache = { hit: true, ttlSeconds: 60 };
      return parsed;
    }

    const sql = `
      SELECT
        toStartOfWeek(signup_day) AS cohort_week,
        floor(dateDiff('day', signup_day, activity_day) / 7) AS week_offset,
        uniqMerge(active_users) AS users
      FROM cohort_daily
      WHERE workspace_id = {workspace_id:UUID}
        AND signup_day >= {from:DateTime}
        AND signup_day <  {to:DateTime}
        AND activity_day >= signup_day
      GROUP BY cohort_week, week_offset
      ORDER BY cohort_week, week_offset
    `;

    const rows = await withWorkspace(this.ch, workspaceId, async (q) => {
      const res = await q.query({
        query: sql,
        query_params: {
          from: from.toISOString().replace('T', ' ').slice(0, 19),
          to: to.toISOString().replace('T', ' ').slice(0, 19),
        },
        format: 'JSONEachRow',
      });
      return (await res.json()) as Array<{
        cohort_week: string;
        week_offset: number | string;
        users: number | string;
      }>;
    });

    const byWeek = new Map<string, number[]>();
    const sizes = new Map<string, number>();
    for (const r of rows) {
      const wk = r.cohort_week;
      const off = Number(r.week_offset);
      const u = Number(r.users);
      if (off < 0 || off > 12) continue;
      if (!byWeek.has(wk)) byWeek.set(wk, new Array(13).fill(0));
      byWeek.get(wk)![off] = u;
      if (off === 0) sizes.set(wk, u);
    }

    const cohorts = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([signup_day, weeks]) => ({
        signup_day,
        cohort_size: sizes.get(signup_day) ?? weeks[0] ?? 0,
        weeks,
      }));

    const payload = { cohorts, cache: { hit: false, ttlSeconds: 60 } };
    await this.redis.client.set(cacheKey, JSON.stringify(payload), 'EX', 60);
    return payload;
  }
}
