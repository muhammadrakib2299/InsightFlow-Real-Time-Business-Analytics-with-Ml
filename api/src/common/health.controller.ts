import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { ClickHouseService } from './clickhouse.service';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clickhouse: ClickHouseService,
  ) {}

  @Get('health')
  async health() {
    return { status: 'ok', service: 'api', ts: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    const [pg, redis, ch] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping(),
      this.clickhouse.ping(),
    ]);
    const ok = pg && redis && ch;
    return {
      status: ok ? 'ok' : 'degraded',
      checks: { postgres: pg, redis, clickhouse: ch },
    };
  }
}
