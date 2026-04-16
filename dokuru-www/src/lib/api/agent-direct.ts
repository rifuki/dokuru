import axios from "axios";

export interface DockerInfo {
  docker_version: string;
  os: string;
  architecture: string;
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
}

export interface AuditSummary {
  total: number;
  passed: number;
  failed: number;
  score: number;
}

export interface AuditResponse {
  timestamp: string;
  hostname: string;
  docker_version: string;
  total_containers: number;
  results: AuditResult[];
  summary: AuditSummary;
}

export const agentDirectApi = {
  getInfo: async (agentUrl: string, token?: string): Promise<DockerInfo> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${agentUrl}/api/v1/info`, { headers });
    return response.data.data;
  },

  runAudit: async (agentUrl: string, token?: string): Promise<AuditResponse> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await axios.get(`${agentUrl}/audit`, { headers });
    return response.data.data;
  },

  checkHealth: async (agentUrl: string): Promise<boolean> => {
    try {
      await axios.get(`${agentUrl}/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },
};
