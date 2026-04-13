import { apiClient } from '@/lib/api/client';

export type CISStatus = "Pass" | "Fail" | "Warn" | "Info";

export interface CheckResult {
  rule_id: string;
  status: CISStatus;
  details: string;
}

export interface AuditReport {
  score: number;
  total_rules: number;
  passed: number;
  failed: number;
  results: CheckResult[];
}

export async function getAudit(): Promise<AuditReport> {
  return apiClient.get<AuditReport>('/audit');
}
