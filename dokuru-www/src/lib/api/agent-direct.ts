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

export interface AuditResult {
  rule_id: string;
  title: string;
  level: string;
  status: "pass" | "fail" | "warn" | "info";
  message: string;
}

export interface AuditResponse {
  total: number;
  passed: number;
  failed: number;
  warned: number;
  results: AuditResult[];
}

export const agentDirectApi = {
  getInfo: async (agentUrl: string): Promise<DockerInfo> => {
    const response = await axios.get(`${agentUrl}/api/v1/info`);
    return response.data.data;
  },

  runAudit: async (agentUrl: string): Promise<AuditResponse> => {
    const response = await axios.get(`${agentUrl}/audit`);
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
