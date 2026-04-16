import axios from "axios";

export interface DockerInfo {
  version: string;
  containers: {
    total: number;
    running: number;
    stopped: number;
  };
  images: number;
  volumes: number;
  networks: number;
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
};
