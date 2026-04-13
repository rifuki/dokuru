import { apiClient } from '@/lib/api/client';
import type { TrivyImageScanResponse } from '@/types/dokuru';

export interface TrivyImageScanRequest {
  image: string;
}

export async function scanImage(image: string): Promise<TrivyImageScanResponse> {
  return apiClient.post<TrivyImageScanResponse>('/integrations/trivy/image', { image });
}
