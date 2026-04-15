use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Severity {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RuleCategory {
    Namespace,
    Cgroup,
    Files,
    Runtime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CheckStatus {
    Pass,
    Fail,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RemediationKind {
    Auto,
    Guided,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FixStatus {
    Applied,
    Guided,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CisRule {
    pub id: String,    // "2.10", "5.11"
    pub title: String, // "Enable user namespace support"
    pub category: RuleCategory,
    pub severity: Severity,
    pub section: String, // "Daemon" or "Container Runtime"
    pub description: String,
    pub remediation: String, // human-readable fix instruction
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    pub rule: CisRule,
    pub status: CheckStatus,
    pub message: String,       // "userns-remap is NOT configured"
    pub affected: Vec<String>, // ["/nginx", "/postgres"] or []
    pub remediation_kind: RemediationKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audit_command: Option<String>, // Command executed for this check
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_output: Option<String>, // Raw command output
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditReport {
    pub timestamp: String,
    pub hostname: String,
    pub docker_version: String,
    pub total_containers: usize,
    pub results: Vec<CheckResult>,
    pub score: u8, // 0-100
    pub passed: usize,
    pub failed: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixOutcome {
    pub rule_id: String,
    pub status: FixStatus,
    pub message: String,
    pub requires_restart: bool,
    pub restart_command: Option<String>,
    pub requires_elevation: bool,
}
