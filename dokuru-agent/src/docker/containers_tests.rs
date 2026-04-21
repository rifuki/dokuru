#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_container_response_creation() {
        let response = ContainerResponse {
            id: "abc123".to_string(),
            names: vec!["/nginx".to_string()],
            image: "nginx:latest".to_string(),
            state: "running".to_string(),
            status: "Up 2 hours".to_string(),
            created: 1234567890,
        };

        assert_eq!(response.id, "abc123");
        assert_eq!(response.names.len(), 1);
        assert_eq!(response.image, "nginx:latest");
        assert_eq!(response.state, "running");
    }

    #[test]
    fn test_container_response_serialization() {
        let response = ContainerResponse {
            id: "test123".to_string(),
            names: vec!["/test-container".to_string()],
            image: "alpine:3.18".to_string(),
            state: "exited".to_string(),
            status: "Exited (0) 5 minutes ago".to_string(),
            created: 1700000000,
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("test123"));
        assert!(json.contains("alpine:3.18"));
        assert!(json.contains("exited"));
    }

    #[test]
    fn test_container_response_multiple_names() {
        let response = ContainerResponse {
            id: "multi123".to_string(),
            names: vec![
                "/container1".to_string(),
                "/container2".to_string(),
                "/container3".to_string(),
            ],
            image: "ubuntu:22.04".to_string(),
            state: "running".to_string(),
            status: "Up 1 day".to_string(),
            created: 1600000000,
        };

        assert_eq!(response.names.len(), 3);
        assert!(response.names.contains(&"/container1".to_string()));
    }

    #[test]
    fn test_list_query_default() {
        let query = ListQuery { all: None };
        assert!(query.all.is_none());
    }

    #[test]
    fn test_list_query_all_true() {
        let query = ListQuery { all: Some(true) };
        assert_eq!(query.all, Some(true));
    }

    #[test]
    fn test_list_query_all_false() {
        let query = ListQuery { all: Some(false) };
        assert_eq!(query.all, Some(false));
    }

    #[test]
    fn test_list_query_deserialization() {
        let json = r#"{"all": true}"#;
        let query: ListQuery = serde_json::from_str(json).unwrap();
        assert_eq!(query.all, Some(true));
    }

    #[test]
    fn test_list_query_deserialization_empty() {
        let json = r#"{}"#;
        let query: ListQuery = serde_json::from_str(json).unwrap();
        assert!(query.all.is_none());
    }

    #[test]
    fn test_container_response_empty_names() {
        let response = ContainerResponse {
            id: "empty123".to_string(),
            names: vec![],
            image: "busybox".to_string(),
            state: "created".to_string(),
            status: "Created".to_string(),
            created: 1500000000,
        };

        assert!(response.names.is_empty());
    }

    #[test]
    fn test_container_response_long_status() {
        let response = ContainerResponse {
            id: "long123".to_string(),
            names: vec!["/app".to_string()],
            image: "node:18-alpine".to_string(),
            state: "running".to_string(),
            status: "Up 3 weeks (healthy)".to_string(),
            created: 1650000000,
        };

        assert!(response.status.contains("healthy"));
        assert!(response.status.contains("weeks"));
    }

    #[test]
    fn test_container_response_deserialization() {
        let json = r#"{
            "id": "deserial123",
            "names": ["/test"],
            "image": "redis:7",
            "state": "running",
            "status": "Up 1 hour",
            "created": 1234567890
        }"#;

        let response: ContainerResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.id, "deserial123");
        assert_eq!(response.image, "redis:7");
    }

    #[test]
    fn test_container_response_with_special_characters() {
        let response = ContainerResponse {
            id: "special-123_abc".to_string(),
            names: vec!["/my-app_v2.0".to_string()],
            image: "myapp:v1.2.3-beta".to_string(),
            state: "running".to_string(),
            status: "Up 2 hours".to_string(),
            created: 1700000000,
        };

        assert!(response.id.contains("-"));
        assert!(response.id.contains("_"));
        assert!(response.image.contains("-beta"));
    }

    #[test]
    fn test_container_response_timestamp() {
        let response = ContainerResponse {
            id: "time123".to_string(),
            names: vec!["/timer".to_string()],
            image: "alpine".to_string(),
            state: "running".to_string(),
            status: "Up".to_string(),
            created: 0,
        };

        assert_eq!(response.created, 0);
    }

    #[test]
    fn test_container_response_future_timestamp() {
        let response = ContainerResponse {
            id: "future123".to_string(),
            names: vec!["/future".to_string()],
            image: "test".to_string(),
            state: "running".to_string(),
            status: "Up".to_string(),
            created: 9999999999,
        };

        assert!(response.created > 1000000000);
    }

    #[test]
    fn test_list_query_unwrap_or_default() {
        let query = ListQuery { all: None };
        let all_value = query.all.unwrap_or(false);
        assert_eq!(all_value, false);

        let query2 = ListQuery { all: Some(true) };
        let all_value2 = query2.all.unwrap_or(false);
        assert_eq!(all_value2, true);
    }

    #[test]
    fn test_container_response_state_variants() {
        let states = vec![
            "created",
            "running",
            "paused",
            "restarting",
            "removing",
            "exited",
            "dead",
        ];

        for state in states {
            let response = ContainerResponse {
                id: format!("state-{}", state),
                names: vec![format!("/{}", state)],
                image: "test".to_string(),
                state: state.to_string(),
                status: format!("Status: {}", state),
                created: 1234567890,
            };

            assert_eq!(response.state, state);
        }
    }

    #[test]
    fn test_container_response_json_roundtrip() {
        let original = ContainerResponse {
            id: "roundtrip123".to_string(),
            names: vec!["/test1".to_string(), "/test2".to_string()],
            image: "postgres:15".to_string(),
            state: "running".to_string(),
            status: "Up 5 minutes".to_string(),
            created: 1700000000,
        };

        let json = serde_json::to_string(&original).unwrap();
        let deserialized: ContainerResponse = serde_json::from_str(&json).unwrap();

        assert_eq!(original.id, deserialized.id);
        assert_eq!(original.names, deserialized.names);
        assert_eq!(original.image, deserialized.image);
        assert_eq!(original.state, deserialized.state);
        assert_eq!(original.created, deserialized.created);
    }
}
