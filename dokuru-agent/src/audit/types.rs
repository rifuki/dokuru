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
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub remediation_guide: Option<String>, // Step-by-step fix guide
}

impl Default for CheckResult {
    fn default() -> Self {
        Self {
            rule: CisRule {
                id: String::new(),
                title: String::new(),
                category: RuleCategory::Files,
                severity: Severity::Low,
                section: String::new(),
                description: String::new(),
                remediation: String::new(),
            },
            status: CheckStatus::Pass,
            message: String::new(),
            affected: Vec::new(),
            remediation_kind: RemediationKind::Manual,
            audit_command: None,
            raw_output: None,
            references: None,
            rationale: None,
            impact: None,
            tags: None,
            remediation_guide: None,
        }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixRequest {
    pub rule_id: String,
    #[serde(default)]
    pub targets: Vec<FixTarget>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixTarget {
    pub container_id: String,
    #[serde(default)]
    pub memory: Option<i64>,
    #[serde(default)]
    pub cpu_shares: Option<i64>,
    #[serde(default)]
    pub pids_limit: Option<i64>,
    #[serde(default)]
    pub strategy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceSuggestion {
    pub memory: i64,
    pub cpu_shares: i64,
    pub pids_limit: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixPreviewTarget {
    pub container_id: String,
    pub container_name: String,
    pub image: String,
    pub current_memory: Option<i64>,
    pub current_cpu_shares: Option<i64>,
    pub current_pids_limit: Option<i64>,
    pub suggestion: ResourceSuggestion,
    pub strategy: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compose_project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compose_service: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixPreview {
    pub rule_id: String,
    pub targets: Vec<FixPreviewTarget>,
    pub requires_restart: bool,
    pub requires_elevation: bool,
    pub steps: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixHistoryEntry {
    pub id: String,
    pub timestamp: String,
    pub request: FixRequest,
    pub outcome: FixOutcome,
    pub rollback_supported: bool,
    #[serde(default)]
    pub rollback_targets: Vec<FixTarget>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollback_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackRequest {
    pub history_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct FixProgress {
    pub rule_id: String,
    pub container_name: String,
    pub step: u8,
    pub total_steps: u8,
    pub action: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_severity_serialization() {
        assert_eq!(serde_json::to_string(&Severity::High).unwrap(), "\"High\"");
        assert_eq!(
            serde_json::to_string(&Severity::Medium).unwrap(),
            "\"Medium\""
        );
        assert_eq!(serde_json::to_string(&Severity::Low).unwrap(), "\"Low\"");
    }

    #[test]
    fn test_check_status_variants() {
        assert_eq!(CheckStatus::Pass, CheckStatus::Pass);
        assert_ne!(CheckStatus::Pass, CheckStatus::Fail);
    }

    #[test]
    fn test_remediation_kind_snake_case() {
        assert_eq!(
            serde_json::to_string(&RemediationKind::Auto).unwrap(),
            "\"auto\""
        );
        assert_eq!(
            serde_json::to_string(&RemediationKind::Guided).unwrap(),
            "\"guided\""
        );
    }

    #[test]
    fn test_check_result_default() {
        let result = CheckResult::default();
        assert_eq!(result.status, CheckStatus::Pass);
        assert!(result.affected.is_empty());
    }

    #[test]
    fn test_cis_rule_creation() {
        let rule = CisRule {
            id: "5.11".to_string(),
            title: "Test".to_string(),
            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            section: "Runtime".to_string(),
            description: "Test".to_string(),
            remediation: "Fix".to_string(),
        };
        assert_eq!(rule.id, "5.11");
    }
}
