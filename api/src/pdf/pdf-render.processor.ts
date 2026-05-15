import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PdfJobStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { TokenService } from '../auth/token.service';
import { PDF_QUEUE } from './pdf.constants';
import { S3Service } from './s3.service';

interface RenderJobData {
  jobId: string;
  workspaceId: string;
  dashboardId: string;
}

@Processor(PDF_QUEUE)
export class PdfRenderProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfRenderProcessor.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly s3: S3Service,
    config: ConfigService,
  ) {
    super();
    this.frontendUrl = (
      config.get<string>('FRONTEND_INTERNAL_URL', 'http://frontend:3000') as string
    ).replace(/\/+$/, '');
  }

  async process(job: Job<RenderJobData>): Promise<void> {
    const { jobId, workspaceId, dashboardId } = job.data;
    this.logger.log(`rendering pdf job=${jobId} dashboard=${dashboardId}`);

    await this.prisma.pdfJob.update({
      where: { id: jobId },
      data: { status: PdfJobStatus.running },
    });

    try {
      // Look up the dashboard's owner so we can mint a short-lived
      // access token the frontend can use for its data fetches inside
      // the headless browser.
      const dashboard = await this.prisma.dashboard.findUnique({
        where: { id: dashboardId },
        select: { createdById: true, workspaceId: true, name: true },
      });
      if (!dashboard) throw new Error('dashboard gone');
      const owner = await this.prisma.user.findUnique({
        where: { id: dashboard.createdById },
      });
      if (!owner) throw new Error('dashboard owner gone');

      const tokens = await this.tokens.issue(owner.id, owner.email);
      const buffer = await this.renderViaPuppeteer(
        `${this.frontendUrl}/dashboards/${dashboardId}?print=1`,
        tokens.accessToken,
      );

      const key = `${workspaceId}/${dashboardId}/${jobId}.pdf`;
      await this.s3.upload(key, buffer);

      await this.prisma.pdfJob.update({
        where: { id: jobId },
        data: {
          status: PdfJobStatus.done,
          s3Key: key,
          completedAt: new Date(),
        },
      });
      this.logger.log(`pdf job=${jobId} stored at ${key}`);
    } catch (err) {
      this.logger.error(
        `pdf job=${jobId} failed: ${err instanceof Error ? err.message : err}`,
      );
      await this.prisma.pdfJob.update({
        where: { id: jobId },
        data: {
          status: PdfJobStatus.failed,
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  private async renderViaPuppeteer(url: string, accessToken: string): Promise<Buffer> {
    // Puppeteer is loaded dynamically so the API image stays slim when
    // PDF export isn't used (and Jest unit tests don't require it).
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1800 });
      // Seed localStorage with the access token before navigating so the
      // frontend's apiFetch picks it up — the auth flow already supports
      // this storage key (see lib/auth.ts).
      await page.evaluateOnNewDocument((token: string) => {
        localStorage.setItem('if.access', token);
      }, accessToken);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });
      // Give widgets a moment to settle (Recharts / React Query).
      // `page.waitForTimeout` was removed in puppeteer v22 — use the
      // node setTimeout primitive instead.
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
