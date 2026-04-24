#[cfg(test)]
mod tests {
    use super::super::rule_registry::RuleRegistry;
    use super::super::types::{
        CheckResult, CheckStatus, CisRule, RemediationKind, RuleCategory, Severity,
    };

    #[test]
    fn test_check_result_creation() {
        let rule = CisRule {
            id: "1.1.1".to_string(),
            title: "Test Rule".to_string(),
            category: RuleCategory::Files,
            severity: Severity::High,
            section: "Test Section".to_string(),
            description: "Test Description".to_string(),
            remediation: "Test Remediation".to_string(),
        };

        let result = CheckResult {
            rule,
            status: CheckStatus::Pass,
            message: "Test passed".to_string(),
            affected: vec![],
            remediation_kind: RemediationKind::Manual,
            audit_command: None,
            raw_output: None,
            references: None,
            rationale: None,
            impact: None,
            tags: None,
            remediation_guide: None,
        };

        assert_eq!(result.rule.id, "1.1.1");
        assert_eq!(result.status, CheckStatus::Pass);
        assert_eq!(result.rule.severity, Severity::High);
    }

    #[test]
    fn test_check_status_variants() {
        let pass = CheckStatus::Pass;
        let fail = CheckStatus::Fail;
        let error = CheckStatus::Error;

        assert_ne!(pass, fail);
        assert_ne!(fail, error);
        assert_ne!(pass, error);
    }

    #[tokio::test]
    async fn test_rule_registry_initialization() {
        let registry = RuleRegistry::new();
        assert!(!registry.all().is_empty());
    }
}
