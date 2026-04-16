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
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub references: Option<Vec<String>>, // External reference links
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rationale: Option<String>, // Why this rule matters
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub impact: Option<String>, // Impact of implementing this rule
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>, // Tags for categorization
}

impl CheckResult {
    /// Create a new `CheckResult` with minimal required fields
    /// Additional metadata will be enriched by `RuleDefinition.check()`
    #[allow(dead_code, clippy::missing_const_for_fn)]
    pub fn new(
        rule: CisRule,
        status: CheckStatus,
        message: String,
        affected: Vec<String>,
        remediation_kind: RemediationKind,
    ) -> Self {
        Self {
            rule,
            status,
            message,
            affected,
            remediation_kind,
            audit_command: None,
            raw_output: None,
            references: None,
            rationale: None,
            impact: None,
            tags: None,
        }
    }

    /// Builder pattern for optional fields
    #[allow(dead_code)]
    pub fn with_audit_command(mut self, cmd: String) -> Self {
        self.audit_command = Some(cmd);
        self
    }

    #[allow(dead_code)]
    pub fn with_raw_output(mut self, output: String) -> Self {
        self.raw_output = Some(output);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditReport {
    pub timestamp: String,
    pub hostname: String,
    pub docker_version: String,
    pub total_containers: usize,
    pub results: Vec<CheckResult>,
    pub summary: AuditSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub score: u8, // 0-100
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
