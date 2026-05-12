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

  async funnel(
    workspaceId: string,
    stepsCsv: string,
    fromIso: string,
    toIso: string,
    windowHours: number,
  ): Promise<{
    steps: Array<{ name: string; reached: number; conversion: number }>;
    cache: { hit: boolean; ttlSeconds: number };
  }> {
    const from = this.coerceTimestamp(fromIso, 'from');
    const to = this.coerceTimestamp(toIso, 'to');
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('from must be earlier than to');
    }
    const steps = stepsCsv.split(',').map((s) => s.trim()).filter(Boolean);
    if (steps.length < 2 || steps.length > 8) {
      throw new BadRequestException('steps must be 2..8 event names');
    }
    for (const s of steps) {
      if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(s)) {
        throw new BadRequestException(`invalid step name: ${s}`);
      }
    }
    if (windowHours < 1 || windowHours > 30 * 24) {
      throw new BadRequestException('window_hours must be 1..720');
    }

    const cacheKey =
      `funnel:${workspaceId}:${windowHours}:${steps.join(',')}:` +
      `${from.toISOString()}:${to.toISOString()}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as Awaited<ReturnType<EventsService['funnel']>>;
      parsed.cache = { hit: true, ttlSeconds: 60 };
      return parsed;
    }

    const stepConds = steps.map((_, i) => `event_name = {step${i}:String}`).join(', ');
    const windowSeconds = windowHours * 3600;
    const sql = `
      SELECT
        funnel_level,
        count() AS users
      FROM (
        SELECT
          user_id,
          windowFunnel(${windowSeconds})(occurred_at, ${stepConds}) AS funnel_level
        FROM events
        WHERE workspace_id = {workspace_id:UUID}
          AND occurred_at >= {from:DateTime}
          AND occurred_at <  {to:DateTime}
          AND user_id != ''
        GROUP BY workspace_id, user_id
      )
      GROUP BY funnel_level
      ORDER BY funnel_level
    `;

    const stepParams: Record<string, string> = {};
    steps.forEach((name, i) => {
      stepParams[`step${i}`] = name;
    });

    const rows = await withWorkspace(this.ch, workspaceId, async (q) => {
      const res = await q.query({
        query: sql,
        query_params: {
          ...stepParams,
          from: from.toISOString().replace('T', ' ').slice(0, 19),
          to: to.toISOString().replace('T', ' ').slice(0, 19),
        },
        format: 'JSONEachRow',
      });
      return (await res.json()) as Array<{ funnel_level: number | string; users: number | string }>;
    });

    const levelCounts: number[] = new Array(steps.length + 1).fill(0);
    for (const r of rows) {
      const lvl = Number(r.funnel_level);
      const u = Number(r.users);
      if (lvl >= 0 && lvl <= steps.length) levelCounts[lvl] = u;
    }
    const reached: number[] = new Array(steps.length).fill(0);
    for (let i = steps.length; i >= 1; i -= 1) {
      reached[i - 1] = levelCounts[i] + (i < steps.length ? reached[i] : 0);
    }
    const first = reached[0] || 0;
    const out = steps.map((name, i) => ({
      name,
      reached: reached[i],
      conversion: first > 0 ? reached[i] / first : 0,
    }));

    const payload = { steps: out, cache: { hit: false, ttlSeconds: 60 } };
    await this.redis.client.set(cacheKey, JSON.stringify(payload), 'EX', 60);
    return payload;
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
