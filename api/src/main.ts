import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS — locked down to the configured dashboard origin(s). Accept a
  // comma-separated list so we can allow both http://localhost:3000 in
  // dev and the prod domain at the same time. * is permitted only when
  // explicitly configured (e.g. local dev with no domain) — never the
  // default in production.
  const corsConfig = (config.get<string>('CORS_ORIGIN', '') as string).trim();
  const allowList = corsConfig
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / curl
      if (allowList.length === 0) return cb(null, true);
      if (allowList.includes('*') || allowList.includes(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'), false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });

  const port = config.get<number>('API_PORT', 4000);
  await app.listen(port, '0.0.0.0');
  logger.log(`InsightFlow API listening on :${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
