import { apiClient } from "@/lib/api";
import { wsApiUrl } from "@/lib/api/api-config";
import { useAuthStore } from "@/stores/use-auth-store";
import type { Agent, CreateAgentDto, UpdateAgentDto } from "@/types/agent";
import type { AuditReportResponse, AuditResponse, AuditResult, FixHistoryEntry, FixOutcome, FixPreview, FixTarget } from "./agent-direct";
import type { HostShellInfo } from "./agent-direct";

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

  previewFix: async (id: string, ruleId: string): Promise<FixPreview> => {
    const response = await apiClient.get(`/agents/${id}/fix/preview`, { params: { rule_id: ruleId } });
    return response.data.data;
  },

  verifyFix: async (id: string, ruleId: string): Promise<AuditResult> => {
    const response = await apiClient.post(`/agents/${id}/fix/verify`, { rule_id: ruleId });
    return response.data.data;
  },

  detectHostShell: async (id: string): Promise<HostShellInfo> => {
    const response = await apiClient.get(`/agents/${id}/host/shell`);
    return response.data.data;
  },

  listFixHistory: async (id: string): Promise<FixHistoryEntry[]> => {
    const response = await apiClient.get(`/agents/${id}/fix/history`);
    return response.data.data;
  },

  rollbackFix: async (id: string, historyId: string): Promise<FixOutcome> => {
    const response = await apiClient.post(`/agents/${id}/fix/rollback`, { history_id: historyId });
    return response.data.data;
  },

  fixStreamUrl: (id: string, request: { rule_id: string; targets?: FixTarget[] }): string => {
    const url = new URL(`${wsApiUrl}/agents/${id}/fix/stream`);
    url.searchParams.set("payload", JSON.stringify({ rule_id: request.rule_id, targets: request.targets ?? [] }));
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) url.searchParams.set("access_token", accessToken);
    return url.toString();
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
