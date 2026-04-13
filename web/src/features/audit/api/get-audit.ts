import { apiClient } from '@/lib/api/client';
import type { AuditReport } from '@/types/dokuru';

export async function getAudit(): Promise<AuditReport> {
  return apiClient.get<AuditReport>('/audit');
}
