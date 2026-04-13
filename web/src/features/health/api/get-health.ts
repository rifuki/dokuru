import { apiClient } from '@/lib/api/client';

export interface HealthStatus {
  status: string;
  docker_connected: boolean;
  docker_version: string | null;
}

export async function getHealth(): Promise<HealthStatus> {
  return apiClient.get<HealthStatus>('/health/detail');
}
