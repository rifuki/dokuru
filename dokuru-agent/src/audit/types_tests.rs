#[cfg(test)]
mod tests {
    use crate::audit::*;

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
    fn test_severity_deserialization() {
        assert_eq!(
            serde_json::from_str::<Severity>("\"High\"").unwrap(),
            Severity::High
        );
        assert_eq!(
            serde_json::from_str::<Severity>("\"Medium\"").unwrap(),
            Severity::Medium
        );
        assert_eq!(
            serde_json::from_str::<Severity>("\"Low\"").unwrap(),
            Severity::Low
        );
    }

    #[test]
    fn test_check_status_variants() {
        assert_eq!(CheckStatus::Pass, CheckStatus::Pass);
        assert_eq!(CheckStatus::Fail, CheckStatus::Fail);
        assert_eq!(CheckStatus::Error, CheckStatus::Error);
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
        assert_eq!(
            serde_json::to_string(&RemediationKind::Manual).unwrap(),
            "\"manual\""
        );
    }

    #[test]
    fn test_rule_category_variants() {
        let categories = [
            RuleCategory::Namespace,
            RuleCategory::Cgroup,
            RuleCategory::Files,
            RuleCategory::Runtime,
        ];
        assert_eq!(categories.len(), 4);
    }

    #[test]
    fn test_cis_rule_creation() {
        let rule = CisRule {
            id: "5.11".to_string(),
            title: "Ensure CPU priority is set appropriately".to_string(),
            category: RuleCategory::Cgroup,
            severity: Severity::Medium,
            section: "Container Runtime".to_string(),
            description: "Test description".to_string(),
            remediation: "Test remediation".to_string(),
        };

        assert_eq!(rule.id, "5.11");
        assert_eq!(rule.category, RuleCategory::Cgroup);
        assert_eq!(rule.severity, Severity::Medium);
    }

    #[test]
    fn test_check_result_default() {
        let result = CheckResult::default();

        assert_eq!(result.status, CheckStatus::Pass);
        assert!(result.message.is_empty());
        assert!(result.affected.is_empty());
        assert_eq!(result.remediation_kind, RemediationKind::Manual);
        assert!(result.audit_command.is_none());
        assert!(result.raw_output.is_none());
    }

    #[test]
    fn test_check_result_with_affected_containers() {
        let result = CheckResult {
            affected: vec!["/nginx".to_string(), "/postgres".to_string()],
            ..Default::default()
        };

        assert_eq!(result.affected.len(), 2);
        assert!(result.affected.contains(&"/nginx".to_string()));
    }

    #[test]
    fn test_check_result_serialization() {
        let result = CheckResult {
            rule: CisRule {
                id: "2.10".to_string(),
                title: "Test Rule".to_string(),
                category: RuleCategory::Namespace,
                severity: Severity::High,
                section: "Daemon".to_string(),
                description: "Test".to_string(),
                remediation: "Fix it".to_string(),
            },
            status: CheckStatus::Fail,
            message: "Test failed".to_string(),
            affected: vec![],
            remediation_kind: RemediationKind::Auto,
            audit_command: Some("docker info".to_string()),
            raw_output: None,
            command_stderr: None,
            command_exit_code: None,
            references: None,
            rationale: None,
            impact: None,
            tags: None,
            remediation_guide: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"id\":\"2.10\""));
        assert!(json.contains("\"status\":\"Fail\""));
    }

    #[test]
    fn test_check_result_optional_fields() {
        let result = CheckResult {
            rule: CisRule {
                id: "1.1".to_string(),
                title: "Test".to_string(),
                category: RuleCategory::Files,
                severity: Severity::Low,
                section: "Host".to_string(),
                description: "Test".to_string(),
                remediation: "Test".to_string(),
            },
            status: CheckStatus::Pass,
            message: "OK".to_string(),
            affected: vec![],
            remediation_kind: RemediationKind::Manual,
            audit_command: None,
            raw_output: None,
            command_stderr: None,
            command_exit_code: None,
            references: Some(vec!["https://example.com".to_string()]),
            rationale: Some("Security best practice".to_string()),
            impact: Some("Low impact".to_string()),
            tags: Some(vec!["security".to_string(), "docker".to_string()]),
            remediation_guide: Some("Step 1: Do this".to_string()),
        };

        assert!(result.references.is_some());
        assert!(result.rationale.is_some());
        assert_eq!(result.tags.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn test_fix_status_variants() {
        let statuses = [FixStatus::Applied, FixStatus::Guided, FixStatus::Blocked];
        assert_eq!(statuses.len(), 3);
    }

    #[test]
    fn test_severity_ordering() {
        // Test that we can compare severities
        assert_eq!(Severity::High, Severity::High);
        assert_ne!(Severity::High, Severity::Low);
    }

    #[test]
    fn test_check_result_clone() {
        let result = CheckResult::default();
        let cloned = result.clone();

        assert_eq!(result.status, cloned.status);
        assert_eq!(result.message, cloned.message);
    }

    #[test]
    fn test_cis_rule_serialization() {
        let rule = CisRule {
            id: "5.25".to_string(),
            title: "Ensure container is restricted from acquiring additional privileges"
                .to_string(),
            category: RuleCategory::Runtime,
            severity: Severity::High,
            section: "Container Runtime".to_string(),
            description: "Restrict privilege escalation".to_string(),
            remediation: "Use --security-opt=no-new-privileges".to_string(),
        };

        let json = serde_json::to_string(&rule).unwrap();
        assert!(json.contains("5.25"));
        assert!(json.contains("Runtime"));
    }

    #[test]
    fn test_check_result_with_all_fields() {
        let result = CheckResult {
            rule: CisRule {
                id: "5.31".to_string(),
                title: "Full test".to_string(),
                category: RuleCategory::Namespace,
                severity: Severity::Medium,
                section: "Runtime".to_string(),
                description: "Full description".to_string(),
                remediation: "Full remediation".to_string(),
            },
            status: CheckStatus::Error,
            message: "Error occurred".to_string(),
            affected: vec!["/container1".to_string(), "/container2".to_string()],
            remediation_kind: RemediationKind::Guided,
            audit_command: Some("ps aux".to_string()),
            raw_output: Some("output data".to_string()),
            command_stderr: None,
            command_exit_code: None,
            references: Some(vec!["ref1".to_string(), "ref2".to_string()]),
            rationale: Some("Important for security".to_string()),
            impact: Some("High impact on performance".to_string()),
            tags: Some(vec!["critical".to_string()]),
            remediation_guide: Some("Follow these steps...".to_string()),
        };

        assert_eq!(result.affected.len(), 2);
        assert_eq!(result.references.as_ref().unwrap().len(), 2);
        assert!(result.audit_command.is_some());
        assert!(result.raw_output.is_some());
    }

    #[test]
    fn test_remediation_kind_deserialization() {
        assert_eq!(
            serde_json::from_str::<RemediationKind>("\"auto\"").unwrap(),
            RemediationKind::Auto
        );
        assert_eq!(
            serde_json::from_str::<RemediationKind>("\"guided\"").unwrap(),
            RemediationKind::Guided
        );
        assert_eq!(
            serde_json::from_str::<RemediationKind>("\"manual\"").unwrap(),
            RemediationKind::Manual
        );
    }

    #[test]
    fn test_check_status_serialization() {
        assert_eq!(
            serde_json::to_string(&CheckStatus::Pass).unwrap(),
            "\"Pass\""
        );
        assert_eq!(
            serde_json::to_string(&CheckStatus::Fail).unwrap(),
            "\"Fail\""
        );
        assert_eq!(
            serde_json::to_string(&CheckStatus::Error).unwrap(),
            "\"Error\""
        );
    }

    #[test]
    fn test_rule_category_equality() {
        assert_eq!(RuleCategory::Namespace, RuleCategory::Namespace);
        assert_ne!(RuleCategory::Namespace, RuleCategory::Cgroup);
        assert_ne!(RuleCategory::Files, RuleCategory::Runtime);
    }

    #[test]
    fn test_empty_affected_containers() {
        let result = CheckResult {
            rule: CisRule {
                id: "1.1".to_string(),
                title: "Test".to_string(),
                category: RuleCategory::Files,
                severity: Severity::Low,
                section: "Host".to_string(),
                description: "Test".to_string(),
                remediation: "Test".to_string(),
            },
            status: CheckStatus::Pass,
            message: "All good".to_string(),
            affected: vec![],
            remediation_kind: RemediationKind::Manual,
            audit_command: None,
            raw_output: None,
            command_stderr: None,
            command_exit_code: None,
            references: None,
            rationale: None,
            impact: None,
            tags: None,
            remediation_guide: None,
        };

        assert!(result.affected.is_empty());
    }

    #[test]
    fn test_multiple_tags() {
        let result = CheckResult {
            tags: Some(vec![
                "security".to_string(),
                "compliance".to_string(),
                "cis".to_string(),
                "docker".to_string(),
            ]),
            ..Default::default()
        };

        assert_eq!(result.tags.as_ref().unwrap().len(), 4);
        assert!(result.tags.as_ref().unwrap().contains(&"cis".to_string()));
    }

    #[test]
    fn test_compose_rollback_target_round_trip() {
        let target = ComposeRollbackTarget {
            project: "dokuru-lab".to_string(),
            service: "dokuru-lab".to_string(),
            compose_path: "/home/rifuki/dokuru-lab/docker-compose.yaml".to_string(),
            backup_path: Some(
                "/home/rifuki/dokuru-lab/docker-compose.yaml.dokuru.rollback.test.bak".to_string(),
            ),
            delete_on_rollback: false,
            working_dir: Some("/home/rifuki/dokuru-lab".to_string()),
            config_files: Some("docker-compose.yaml".to_string()),
        };

        let json = serde_json::to_string(&target).unwrap();
        let decoded = serde_json::from_str::<ComposeRollbackTarget>(&json).unwrap();

        assert_eq!(decoded, target);
    }
}
