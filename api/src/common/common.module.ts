import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { ClickHouseService } from './clickhouse.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, ClickHouseService],
  exports: [PrismaService, RedisService, ClickHouseService],
})
export class CommonModule {}
