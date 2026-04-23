#[cfg(test)]
mod tests {
    use super::super::rule_registry::RuleRegistry;
    use super::super::types::{AuditResult, AuditStatus, Severity};

    #[test]
    fn test_audit_result_creation() {
        let result = AuditResult {
            rule_id: "1.1.1".to_string(),
            title: "Test Rule".to_string(),
            description: "Test Description".to_string(),
            severity: Severity::High,
            status: AuditStatus::Pass,
            message: "Test passed".to_string(),
            remediation: None,
        };

        assert_eq!(result.rule_id, "1.1.1");
        assert_eq!(result.status, AuditStatus::Pass);
        assert_eq!(result.severity, Severity::High);
    }

    #[test]
    fn test_severity_ordering() {
        assert!(Severity::Critical > Severity::High);
        assert!(Severity::High > Severity::Medium);
        assert!(Severity::Medium > Severity::Low);
        assert!(Severity::Low > Severity::Info);
    }

    #[test]
    fn test_audit_status_variants() {
        let pass = AuditStatus::Pass;
        let fail = AuditStatus::Fail;
        let skip = AuditStatus::Skip;

        assert_ne!(pass, fail);
        assert_ne!(fail, skip);
        assert_ne!(pass, skip);
    }

    #[tokio::test]
    async fn test_rule_registry_initialization() {
        let registry = RuleRegistry::new();
        let rules = registry.get_all_rules();

        assert!(!rules.is_empty(), "Registry should contain rules");
    }

    #[tokio::test]
    async fn test_rule_registry_get_by_id() {
        let registry = RuleRegistry::new();

        // Test getting existing rule
        if let Some(rule) = registry.get_rule("1.1.1") {
            assert_eq!(rule.id, "1.1.1");
        }
    }
}
