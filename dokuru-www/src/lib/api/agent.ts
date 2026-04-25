import { apiClient } from "@/lib/api";
import type { Agent, CreateAgentDto, UpdateAgentDto } from "@/types/agent";
import type { AuditReportResponse, AuditResponse, FixOutcome, FixTarget } from "./agent-direct";

export interface RelayFixResponse {
  outcome: FixOutcome;
  audit: AuditResponse | null;
}

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

  update: async (id: string, dto: UpdateAgentDto): Promise<Agent> => {
    const response = await apiClient.put(`/agents/${id}`, dto);
    return response.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/agents/${id}`);
  },

  saveAudit: async (id: string, auditData: AuditResponse): Promise<AuditResponse> => {
    const response = await apiClient.post(`/agents/${id}/audit`, auditData);
    return response.data.data;
  },

  runAudit: async (id: string): Promise<AuditResponse> => {
    const response = await apiClient.post(`/agents/${id}/audit/run`);
    return response.data.data;
  },

  applyFix: async (id: string, ruleId: string, targets?: FixTarget[]): Promise<RelayFixResponse> => {
    const payload = targets ? { rule_id: ruleId, targets } : { rule_id: ruleId };
    const response = await apiClient.post(`/agents/${id}/fix`, payload);
    return response.data.data;
  },

  getAuditById: async (id: string, auditId: string): Promise<AuditResponse> => {
    const response = await apiClient.get(`/agents/${id}/audit/${auditId}`);
    return response.data.data;
  },

  getAuditReport: async (id: string, auditId: string): Promise<AuditReportResponse> => {
    const response = await apiClient.get(`/agents/${id}/audit/${auditId}/report`);
    return response.data.data;
  },

  listAudits: async (id: string): Promise<AuditResponse[]> => {
    const response = await apiClient.get(`/agents/${id}/audits`);
    return response.data.data;
  },
};
