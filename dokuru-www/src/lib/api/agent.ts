import axios from "axios";
import { apiClient } from "@/lib/api";
import { wsApiUrl } from "@/lib/api/api-config";
import { IS_LOCAL_AGENT_MODE } from "@/lib/env";
import { getLocalAgentToken, localAgent, localAgentUrl, LOCAL_AGENT_ID, setLocalAgentBootstrap, setLocalAgentToken } from "@/lib/local-agent";
import { useAuthStore } from "@/stores/use-auth-store";
import type { Agent, CreateAgentDto, UpdateAgentDto } from "@/types/agent";
import { agentDirectApi, type AuditReportResponse, type AuditResponse, type AuditResult, type FixHistoryEntry, type FixOutcome, type FixPreview, type FixTarget } from "./agent-direct";
import type { HostShellInfo } from "./agent-direct";

export interface RelayFixResponse {
  outcome: FixOutcome;
  audit: AuditResponse | null;
}

function localAgentHeaders() {
  const token = getLocalAgentToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

function localAgentRootUrl() {
  return localAgentUrl().replace(/\/+$/, "");
}

export const agentApi = {
  list: async (): Promise<Agent[]> => {
    if (IS_LOCAL_AGENT_MODE) return [localAgent()];
    const response = await apiClient.get("/agents");
    return response.data.data;
  },

  create: async (dto: CreateAgentDto): Promise<Agent> => {
    if (IS_LOCAL_AGENT_MODE) {
      setLocalAgentBootstrap({ token: dto.token, name: dto.name, url: localAgentRootUrl() });
      return localAgent();
    }
    const response = await apiClient.post("/agents", dto);
    return response.data.data;
  },

  getById: async (id: string): Promise<Agent> => {
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) return localAgent();
    const response = await apiClient.get(`/agents/${id}`);
    return response.data.data;
  },

  update: async (id: string, dto: UpdateAgentDto): Promise<Agent> => {
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) {
      if (dto.token) setLocalAgentToken(dto.token);
      return localAgent();
    }
    const response = await apiClient.put(`/agents/${id}`, dto);
    return response.data.data;
  },

  delete: async (id: string): Promise<void> => {
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) return;
    await apiClient.delete(`/agents/${id}`);
  },

  saveAudit: async (id: string, auditData: AuditResponse): Promise<AuditResponse> => {
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) {
      const response = await axios.post(`${localAgentRootUrl()}/audit/history`, auditData, { headers: localAgentHeaders() });
      return response.data.data;
    }
    const response = await apiClient.post(`/agents/${id}/audit`, auditData);
    return response.data.data;
  },

  runAudit: async (id: string): Promise<AuditResponse> => {
    const response = await apiClient.post(`/agents/${id}/audit/run`);
    return response.data.data;
  },

  auditStreamUrl: (id: string): string => {
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) {
      throw new Error("Local agent audits use the direct agent stream");
    }
    const url = new URL(`${wsApiUrl}/agents/${id}/audit/stream`);
    const accessToken = useAuthStore.getState().accessToken;
    if (accessToken) url.searchParams.set("access_token", accessToken);
    return url.toString();
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
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) {
      return agentDirectApi.listFixHistory(localAgentRootUrl(), getLocalAgentToken());
    }
    const response = await apiClient.get(`/agents/${id}/fix/history`);
    return response.data.data;
  },

  rollbackFix: async (id: string, historyId: string): Promise<FixOutcome> => {
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) {
      return agentDirectApi.rollbackFix(localAgentRootUrl(), historyId, getLocalAgentToken());
    }
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
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) {
      const response = await axios.get(`${localAgentRootUrl()}/audit/history/${auditId}`, { headers: localAgentHeaders() });
      return response.data.data;
    }
    const response = await apiClient.get(`/agents/${id}/audit/${auditId}`);
    return response.data.data;
  },

  deleteAudit: async (id: string, auditId: string): Promise<void> => {
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) {
      await axios.delete(`${localAgentRootUrl()}/audit/history/${auditId}`, { headers: localAgentHeaders() });
      return;
    }
    await apiClient.delete(`/agents/${id}/audit/${auditId}`);
  },

  getAuditReport: async (id: string, auditId: string): Promise<AuditReportResponse> => {
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) {
      const response = await axios.get(`${localAgentRootUrl()}/audit/history/${auditId}/report`, { headers: localAgentHeaders() });
      return response.data.data;
    }
    const response = await apiClient.get(`/agents/${id}/audit/${auditId}/report`);
    return response.data.data;
  },

  listAudits: async (id: string): Promise<AuditResponse[]> => {
    if (IS_LOCAL_AGENT_MODE && id === LOCAL_AGENT_ID) {
      const response = await axios.get(`${localAgentRootUrl()}/audit/history`, { headers: localAgentHeaders() });
      return response.data.data;
    }
    const response = await apiClient.get(`/agents/${id}/audits`);
    return response.data.data;
  },
};
