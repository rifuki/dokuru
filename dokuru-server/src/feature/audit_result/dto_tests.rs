#[cfg(test)]
mod tests {
    use super::super::dto::*;
    use serde_json::json;

    #[test]
    fn test_save_audit_dto_valid() {
        let dto = SaveAuditDto {
            timestamp: "2026-04-21T05:00:00Z".to_string(),
            hostname: "test-host".to_string(),
            docker_version: "24.0.0".to_string(),
            total_containers: 5,
            results: json!([
                {
                    "rule_id": "1.1.1",
                    "status": "pass",
                    "message": "Test passed"
                }
            ]),
            summary: AuditSummaryDto {
                total: 10,
                passed: 8,
                failed: 2,
                score: 80,
            },
        };

        assert_eq!(dto.hostname, "test-host");
        assert_eq!(dto.total_containers, 5);
        assert_eq!(dto.summary.passed, 8);
        assert_eq!(dto.summary.failed, 2);
        assert_eq!(dto.summary.score, 80);
    }

    #[test]
    fn test_audit_summary_dto_perfect_score() {
        let summary = AuditSummaryDto {
            total: 10,
            passed: 10,
            failed: 0,
            score: 100,
        };

        assert_eq!(summary.total, 10);
        assert_eq!(summary.passed, 10);
        assert_eq!(summary.failed, 0);
        assert_eq!(summary.score, 100);
    }

    #[test]
    fn test_audit_summary_dto_zero_score() {
        let summary = AuditSummaryDto {
            total: 10,
            passed: 0,
            failed: 10,
            score: 0,
        };

        assert_eq!(summary.passed, 0);
        assert_eq!(summary.failed, 10);
        assert_eq!(summary.score, 0);
    }

    #[test]
    fn test_save_audit_dto_serialization() {
        let dto = SaveAuditDto {
            timestamp: "2026-04-21T05:00:00Z".to_string(),
            hostname: "test-host".to_string(),
            docker_version: "24.0.0".to_string(),
            total_containers: 3,
            results: json!([]),
            summary: AuditSummaryDto {
                total: 5,
                passed: 5,
                failed: 0,
                score: 100,
            },
        };

        let serialized = serde_json::to_string(&dto);
        assert!(serialized.is_ok());

        let json_str = serialized.unwrap();
        assert!(json_str.contains("test-host"));
        assert!(json_str.contains("24.0.0"));
        assert!(json_str.contains("2026-04-21T05:00:00Z"));
    }

    #[test]
    fn test_save_audit_dto_deserialization() {
        let json_data = json!({
            "timestamp": "2026-04-21T05:00:00Z",
            "hostname": "prod-server",
            "docker_version": "25.0.1",
            "total_containers": 10,
            "results": [],
            "summary": {
                "total": 20,
                "passed": 15,
                "failed": 5,
                "score": 75
            }
        });

        let dto: Result<SaveAuditDto, _> = serde_json::from_value(json_data);
        assert!(dto.is_ok());

        let dto = dto.unwrap();
        assert_eq!(dto.hostname, "prod-server");
        assert_eq!(dto.summary.score, 75);
        assert_eq!(dto.summary.total, 20);
    }

    #[test]
    fn test_save_audit_dto_zero_containers() {
        let dto = SaveAuditDto {
            timestamp: "2026-04-21T05:00:00Z".to_string(),
            hostname: "empty-host".to_string(),
            docker_version: "24.0.0".to_string(),
            total_containers: 0,
            results: json!([]),
            summary: AuditSummaryDto {
                total: 10,
                passed: 10,
                failed: 0,
                score: 100,
            },
        };

        assert_eq!(dto.total_containers, 0);
        assert_eq!(dto.summary.score, 100);
    }

    #[test]
    fn test_save_audit_dto_complex_results() {
        let results = json!([
            {
                "rule_id": "1.1.1",
                "section": "Host Configuration",
                "status": "pass",
                "message": "Docker daemon is properly configured"
            },
            {
                "rule_id": "1.1.2",
                "section": "Host Configuration",
                "status": "fail",
                "message": "Audit logs not enabled"
            },
            {
                "rule_id": "5.1.1",
                "section": "Container Runtime",
                "status": "pass",
                "message": "AppArmor profile is set"
            }
        ]);

        let dto = SaveAuditDto {
            timestamp: "2026-04-21T05:00:00Z".to_string(),
            hostname: "complex-host".to_string(),
            docker_version: "24.0.0".to_string(),
            total_containers: 3,
            results: results.clone(),
            summary: AuditSummaryDto {
                total: 3,
                passed: 2,
                failed: 1,
                score: 66,
            },
        };

        assert_eq!(dto.results, results);
        assert!(dto.results.is_array());
        assert_eq!(dto.results.as_array().unwrap().len(), 3);
    }

    #[test]
    fn test_audit_summary_response_conversion() {
        let summary = AuditSummaryResponse {
            total: 50,
            passed: 45,
            failed: 5,
            score: 90,
        };

        assert_eq!(summary.total, 50);
        assert_eq!(summary.passed, 45);
        assert_eq!(summary.failed, 5);
        assert_eq!(summary.score, 90);
    }

    #[test]
    fn test_save_audit_dto_timestamp_formats() {
        let timestamps = vec![
            "2026-04-21T05:00:00Z",
            "2026-04-21T05:00:00.000Z",
            "2026-04-21T05:00:00+07:00",
        ];

        for timestamp in timestamps {
            let dto = SaveAuditDto {
                timestamp: timestamp.to_string(),
                hostname: "test".to_string(),
                docker_version: "24.0.0".to_string(),
                total_containers: 1,
                results: json!([]),
                summary: AuditSummaryDto {
                    total: 1,
                    passed: 1,
                    failed: 0,
                    score: 100,
                },
            };

            assert_eq!(dto.timestamp, timestamp);
        }
    }
}
