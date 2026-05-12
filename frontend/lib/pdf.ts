import { apiFetch } from './api';
import { getActiveWorkspace } from './auth';

export type PdfStatus = 'queued' | 'running' | 'done' | 'failed';

export interface PdfJob {
  id: string;
  status: PdfStatus;
  s3Key: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

function base(dashboardId: string): string {
  const ws = getActiveWorkspace();
  if (!ws) throw new Error('no active workspace');
  return `/api/workspaces/${ws.id}/dashboards/${dashboardId}/pdf`;
}

export async function enqueuePdf(dashboardId: string): Promise<PdfJob> {
  return apiFetch<PdfJob>(base(dashboardId), { method: 'POST' });
}

export async function pollPdf(dashboardId: string, jobId: string): Promise<PdfJob> {
  return apiFetch<PdfJob>(`${base(dashboardId)}/${jobId}`);
}

export async function downloadPdf(
  dashboardId: string,
  jobId: string,
): Promise<{ url: string; expiresIn: number }> {
  return apiFetch<{ url: string; expiresIn: number }>(
    `${base(dashboardId)}/${jobId}/download`,
  );
}
