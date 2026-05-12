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
}
