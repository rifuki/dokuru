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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CheckStatus {
    Pass,
    Fail,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CisRule {
    pub id: String,          // "2.10", "5.11"
    pub title: String,       // "Enable user namespace support"
    pub category: RuleCategory,
    pub severity: Severity,
    pub section: String,     // "Daemon" or "Container Runtime"
    pub description: String,
    pub remediation: String, // human-readable fix instruction
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckResult {
    pub rule: CisRule,
    pub status: CheckStatus,
    pub message: String,     // "userns-remap is NOT configured"
    pub affected: Vec<String>, // ["/nginx", "/postgres"] or []
    pub fix_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditReport {
    pub timestamp: String,
    pub hostname: String,
    pub docker_version: String,
    pub total_containers: usize,
    pub results: Vec<CheckResult>,
    pub score: u8,           // 0-100
    pub passed: usize,
    pub failed: usize,
}
