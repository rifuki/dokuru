import { apiClient } from "@/lib/api";
import type { Agent, CreateAgentDto } from "@/types/agent";

export const agentApi = {
  list: async (): Promise<Agent[]> => {
    const response = await apiClient.get("/agents");
    return response.data.data;
  },

  create: async (dto: CreateAgentDto): Promise<Agent> => {
    const response = await apiClient.post("/agents", dto);
    return response.data.data;
  },

  getById: async (id: string): Promise<Agent> => {
    const response = await apiClient.get(`/agents/${id}`);
    return response.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/agents/${id}`);
  },
};
