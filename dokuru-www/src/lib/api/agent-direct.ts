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

    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${agentUrl}/api/v1/info`, { headers, timeout: 10000 });
    return response.data.data;
  },

  runAudit: async (agentUrl: string, token?: string): Promise<AuditResponse> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${agentUrl}/audit`, { headers });
    return response.data.data;
  },

  applyFix: async (agentUrl: string, ruleId: string, token?: string): Promise<FixOutcome> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.post(`${agentUrl}/fix`, { rule_id: ruleId }, { headers });
    return response.data.data;
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
