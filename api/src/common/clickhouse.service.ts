import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, ClickHouseClient } from '@clickhouse/client';

@Injectable()
export class ClickHouseService implements OnModuleDestroy {
  readonly client: ClickHouseClient;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('CLICKHOUSE_HOST', 'clickhouse');
    const port = this.config.get<number>('CLICKHOUSE_HTTP_PORT', 8123);
    const user = this.config.get<string>('CLICKHOUSE_USER', 'default');
    const password = this.config.get<string>('CLICKHOUSE_PASSWORD', '');
    const database = this.config.get<string>('CLICKHOUSE_DB', 'insightflow');

    this.client = createClient({
      url: `http://${host}:${port}`,
      username: user,
      password,
      database,
      request_timeout: 30_000,
      compression: { request: false, response: true },
    });
  }

  async ping(): Promise<boolean> {
    try {
      const r = await this.client.ping();
      return r.success === true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
