import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PdfJobStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PDF_QUEUE } from './pdf.constants';
import { S3Service } from './s3.service';

@Injectable()
export class PdfService {
  constructor(
    @InjectQueue(PDF_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async enqueue(workspaceId: string, dashboardId: string, requestedById: string) {
    const job = await this.prisma.pdfJob.create({
      data: {
        workspaceId,
        dashboardId,
        requestedBy: requestedById,
        status: PdfJobStatus.queued,
      },
    });
    await this.queue.add(
      'render',
      { jobId: job.id, workspaceId, dashboardId },
      { removeOnComplete: 500, removeOnFail: 100, attempts: 2, backoff: { type: 'fixed', delay: 5000 } },
    );
    return job;
  }

  async get(workspaceId: string, jobId: string) {
    const job = await this.prisma.pdfJob.findFirst({ where: { id: jobId, workspaceId } });
    if (!job) throw new NotFoundException('pdf job not found');
    return job;
  }

  async download(workspaceId: string, jobId: string): Promise<string> {
    const job = await this.get(workspaceId, jobId);
    if (job.status !== PdfJobStatus.done || !job.s3Key) {
      throw new NotFoundException('pdf not ready');
    }
    return this.s3.presignGet(job.s3Key, 3600);
  }
}
