import { apiClient } from '@/lib/api/client';

export interface FixRequest {
  rule_id: string;
}

export async function applyFix(ruleId: string): Promise<void> {
  return apiClient.post<void>('/fix', { rule_id: ruleId });
}
