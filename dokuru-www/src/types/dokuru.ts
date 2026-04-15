export type Severity = 'High' | 'Medium' | 'Low';

export type RuleCategory = 'Namespace' | 'Cgroup';

export type CheckStatus = 'Pass' | 'Fail' | 'Error';

export type RemediationKind = 'auto' | 'guided' | 'manual';

export type FixStatus = 'applied' | 'guided' | 'blocked';

export interface CisRule {
  id: string;
  title: string;
  category: RuleCategory;
  severity: Severity;
  section: string;
  description: string;
  remediation: string;
}

export interface CheckResult {
  rule: CisRule;
  status: CheckStatus;
  message: string;
  affected: string[];
  remediation_kind: RemediationKind;
  audit_command?: string;
  raw_output?: string;
}

export interface AuditReport {
  timestamp: string;
  hostname: string;
  docker_version: string;
  total_containers: number;
  results: CheckResult[];
  score: number;
  passed: number;
  failed: number;
}

export interface HealthDetail {
  status: string;
  version: string;
  timestamp: string;
  docker_connected: boolean;
  docker_version: string | null;
}

export interface FixOutcome {
  rule_id: string;
  status: FixStatus;
  message: string;
  requires_restart: boolean;
  restart_command: string | null;
  requires_elevation: boolean;
}

export interface TrivySeveritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
  total: number;
}

export interface TrivyFinding {
  target: string;
  vulnerability_id: string;
  package_name: string;
  installed_version: string;
  fixed_version: string | null;
  severity: string;
  title: string | null;
  primary_url: string | null;
}

export interface TrivyImageScanResponse {
  image: string;
  summary: TrivySeveritySummary;
  findings: TrivyFinding[];
}
