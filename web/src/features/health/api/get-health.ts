import { apiClient } from '@/lib/api/client';
import type { HealthDetail } from '@/types/dokuru';

export async function getHealth(): Promise<HealthDetail> {
  return apiClient.get<HealthDetail>('/health/detail');
}
