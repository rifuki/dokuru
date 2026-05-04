import axios from "axios";
import apiClient from "./axios-instance";

export interface DockerInfo {
  docker_version: string;
  api_version?: string;
  os: string;
  architecture: string;
  hostname?: string;
  kernel_version?: string;
  docker_root_dir?: string;
  storage_driver?: string;
  logging_driver?: string;
  containers: {
    total: number;
    running: number;
    stopped: number;
    healthy: number;
    unhealthy: number;
  };
  stacks: number;
  images: number;
  volumes: number;
  networks: number;
  cpu_count: number;
  memory_total: number;
}

export interface CisRule {
  id: string;
  title: string;
  category: string;
  severity: "High" | "Medium" | "Low";
  section: string;
  description: string;
  remediation: string;
}

export interface AuditResult {
  rule: CisRule;
  status: "Pass" | "Fail" | "Error";
  message: string;
  affected: string[];
  remediation_kind: "auto" | "guided" | "manual";
  audit_command?: string;
  raw_output?: string;
  command_stderr?: string;
  command_exit_code?: number;
  references?: string[];
  rationale?: string;
  impact?: string;
  tags?: string[];
  remediation_guide?: string;
}

export interface FixOutcome {
  rule_id: string;
  status: "Applied" | "Guided" | "Blocked";
  message: string;
  requires_restart: boolean;
  restart_command?: string;
  requires_elevation: boolean;
}

export interface FixTarget {
  container_id: string;
  memory?: number;
  cpu_shares?: number;
  pids_limit?: number;
  strategy?: string;
}

export interface ResourceSuggestion {
  memory: number;
  cpu_shares: number;
  pids_limit: number;
}

export interface FixPreviewTarget {
  container_id: string;
  container_name: string;
  image: string;
  current_memory?: number | null;
  current_cpu_shares?: number | null;
  current_pids_limit?: number | null;
  suggestion?: ResourceSuggestion | null;
  strategy: string;
  compose_project?: string;
  compose_service?: string;
  dockerfile_path?: string;
  dockerfile_context?: string;
}

export interface FixPreview {
  rule_id: string;
  targets: FixPreviewTarget[];
  requires_restart: boolean;
  requires_elevation: boolean;
  steps: string[];
}

export interface FixProgress {
  rule_id: string;
  container_name: string;
  step: number;
  total_steps: number;
  action: string;
  status: "in_progress" | "done" | "error" | string;
  detail?: string;
  command?: string;
  stdout?: string;
  stderr?: string;
}

export interface FixHistoryEntry {
  id: string;
  timestamp: string;
  request: { rule_id: string; targets: FixTarget[] };
  outcome: FixOutcome;
  rollback_supported: boolean;
  rollback_targets: FixTarget[];
  progress_events?: FixProgress[];
  rollback_note?: string;
}

export interface HostShellInfo {
  shell: string;
}

export interface AuditSummary {
  total: number;
  passed: number;
  failed: number;
  score: number;
}

export interface AuditReportSummary extends AuditSummary {
  errors: number;
}

export interface AuditGroupSummary {
  key: string;
  label: string;
  number: string | null;
  total: number;
  passed: number;
  failed: number;
  errors: number;
  percent: number;
}

export interface AuditSeverityFailureSummary {
  high: number;
  medium: number;
  low: number;
  unknown: number;
  total: number;
}

export type AuditRemediationEffort = "quick" | "moderate" | "involved";

export interface AuditRemediationAction {
  rank: number;
  rule_id: string;
  title: string;
  severity: "High" | "Medium" | "Low" | string;
  section_key: string;
  section_label: string;
  pillar_key: string;
  pillar_label: string;
  remediation_kind: "auto" | "guided" | "manual" | string;
  effort: AuditRemediationEffort;
  risk_score: number;
  affected_count: number;
  command_available: boolean;
  summary: string;
}

export interface AuditRemediationPlan {
  total_failed: number;
  auto_fixable: number;
  guided: number;
  manual: number;
  high_impact: number;
  medium_impact: number;
  low_impact: number;
  quick_wins: number;
  actions: AuditRemediationAction[];
}

export interface AuditViewReport {
  summary: AuditReportSummary;
  score_band: "healthy" | "warning" | "critical";
  sections: AuditGroupSummary[];
  pillars: AuditGroupSummary[];
  severity_failures: AuditSeverityFailureSummary;
  remediation: AuditRemediationPlan;
  sorted_results: AuditResult[];
}

export interface AuditResponse {
  id?: string;
  timestamp: string;
  hostname: string;
  docker_version: string;
  total_containers: number;
  results: AuditResult[];
  summary: AuditSummary;
}

export type AuditStreamMessage =
  | { type: "started"; total: number }
  | { type: "progress"; index: number; total: number; data: AuditResult }
  | { type: "complete"; data: AuditResponse }
  | { type: "error"; message: string };

export interface AuditReportResponse {
  audit_id: string;
  agent_id: string;
  timestamp: string;
  hostname: string;
  docker_version: string;
  total_containers: number;
  report: AuditViewReport;
}

export const agentDirectApi = {
  getInfo: async (agentUrl: string, token?: string): Promise<DockerInfo> => {
    if (agentUrl === "relay") {
      if (!token) throw new Error("Relay agent id is required");
      const response = await apiClient.get(`/agents/${token}/docker/info`);
      return response.data;
    }

    const response = await axios.get(`${agentUrl}/api/v1/info`, {
      params: token ? { token } : undefined,
      timeout: 10000,
    });
    return response.data.data;
  },

  runAudit: async (agentUrl: string, token?: string): Promise<AuditResponse> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${agentUrl}/audit`, { headers });
    return response.data.data;
  },

  auditStreamUrl: (agentUrl: string, token?: string): string => {
    const url = new URL(`${agentUrl}/audit/ws`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (token) url.searchParams.set("token", token);
    return url.toString();
  },

  applyFix: async (agentUrl: string, ruleId: string, token?: string, targets?: FixTarget[]): Promise<FixOutcome> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const payload = targets ? { rule_id: ruleId, targets } : { rule_id: ruleId };
    const response = await axios.post(`${agentUrl}/fix`, payload, { headers });
    return response.data.data;
  },

  previewFix: async (agentUrl: string, ruleId: string, token?: string): Promise<FixPreview> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${agentUrl}/fix/preview`, {
      headers,
      params: { rule_id: ruleId },
    });
    return response.data.data;
  },

  verifyFix: async (agentUrl: string, ruleId: string, token?: string): Promise<AuditResult> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.post(`${agentUrl}/fix/verify`, { rule_id: ruleId }, { headers });
    return response.data.data;
  },

  detectHostShell: async (agentUrl: string, token?: string): Promise<HostShellInfo> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${agentUrl}/host/shell`, { headers });
    return response.data.data ?? response.data;
  },

  listFixHistory: async (agentUrl: string, token?: string): Promise<FixHistoryEntry[]> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${agentUrl}/fix/history`, { headers });
    return response.data.data;
  },

  rollbackFix: async (agentUrl: string, historyId: string, token?: string): Promise<FixOutcome> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.post(`${agentUrl}/fix/rollback`, { history_id: historyId }, { headers });
    return response.data.data;
  },

  fixStreamUrl: (agentUrl: string, request: { rule_id: string; targets?: FixTarget[] }, token?: string): string => {
    const url = new URL(`${agentUrl}/fix/stream`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("payload", JSON.stringify({ rule_id: request.rule_id, targets: request.targets ?? [] }));
    if (token) url.searchParams.set("token", token);
    return url.toString();
  },

  checkHealth: async (agentUrl: string, token?: string): Promise<boolean> => {
    try {
      if (agentUrl === "relay") {
        if (!token) return false;
        await apiClient.get(`/agents/${token}/health`);
        return true;
      }

      await axios.get(`${agentUrl}/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },
};
