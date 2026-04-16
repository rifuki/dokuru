/**
 * Environment Services
 * Server-backed environment management
 */

import apiClient from "@/lib/api/axios-instance";
import { API_ENDPOINTS } from "@/lib/api/endpoints";

export interface Environment {
  id: string;
  name: string;
  url: string;
  access_mode: string;
  created_at: string;
}

export interface CreateEnvironmentRequest {
  name: string;
  url: string;
  token: string;
  access_mode: string;
}

export const environmentService = {
  async list(): Promise<Environment[]> {
    const response = await apiClient.get(API_ENDPOINTS.ENVIRONMENTS.LIST);
    return response.data.data;
  },

  async create(data: CreateEnvironmentRequest): Promise<Environment> {
    const response = await apiClient.post(API_ENDPOINTS.ENVIRONMENTS.CREATE, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.ENVIRONMENTS.DELETE(id));
  },
};
