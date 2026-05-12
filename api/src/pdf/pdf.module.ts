import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AuthModule } from '../auth/auth.module';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';
import { PdfRenderProcessor } from './pdf-render.processor';
import { S3Service } from './s3.service';

export const PDF_QUEUE = 'pdf-render';

@Module({
  imports: [
    AuthModule,
    WorkspacesModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          // BullMQ accepts a Redis connection — we point it at the same
          // instance we use for cache / pub-sub.
          url: config.get<string>('REDIS_URL', 'redis://redis:6379'),
        },
      }),
    }),
    BullModule.registerQueue({ name: PDF_QUEUE }),
  ],
  controllers: [PdfController],
  providers: [PdfService, PdfRenderProcessor, S3Service],
  exports: [PdfService],
})
export class PdfModule {}
