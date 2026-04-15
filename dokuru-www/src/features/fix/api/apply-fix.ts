import { apiClient } from '@/lib/api/client';
import type { FixOutcome } from '@/types/dokuru';

export interface FixRequest {
  rule_id: string;
}

export async function applyFix(ruleId: string): Promise<FixOutcome> {
  return apiClient.post<FixOutcome>('/fix', { rule_id: ruleId });
}
