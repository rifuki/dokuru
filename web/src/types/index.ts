export type CISCategory = "HostConfiguration" | "DockerDaemon" | "ContainerRuntime";

export type CISStatus = "Pass" | "Fail" | "Warn" | "Info";

export interface CisRule {
  id: string;
  title: string;
  description: string;
  severity: "High" | "Medium" | "Low";
  category: CISCategory;
}

export interface CheckResult {
  rule_id: string;
  status: CISStatus;
  details: string;
}

export interface AuditReport {
  score: number;
  total_rules: number;
  passed: number;
  failed: number;
  results: CheckResult[];
}

export interface HealthStatus {
  status: string;
  docker_connected: boolean;
  docker_version: string | null;
}
