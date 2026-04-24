#[cfg(test)]
mod tests {
    use crate::feature::agent::domain::{
        AgentValidationError, hash_token, is_agent_online_at, validate_access_mode,
        validate_agent_name, validate_agent_url, validate_status, validate_token,
    };

    #[test]
    fn test_agent_status_validation() {
        assert!(validate_status("online").is_ok());
        assert!(validate_status("offline").is_ok());
        assert!(validate_status("unknown").is_ok());
        assert_eq!(
            validate_status("invalid").unwrap_err(),
            AgentValidationError::InvalidStatus
        );
    }

    #[test]
    fn test_agent_url_validation() {
        assert!(validate_agent_url("http://localhost:8080").is_ok());
        assert!(validate_agent_url("https://agent.example.com").is_ok());
        assert!(validate_agent_url("http://192.168.1.100:9000").is_ok());
        assert!(validate_agent_url("relay").is_ok());
        assert_eq!(
            validate_agent_url("invalid-url").unwrap_err(),
            AgentValidationError::InvalidUrl
        );
        assert_eq!(
            validate_agent_url("").unwrap_err(),
            AgentValidationError::InvalidUrl
        );
    }

    #[test]
    fn test_access_mode_validation() {
        assert!(validate_access_mode("direct").is_ok());
        assert!(validate_access_mode("cloudflare").is_ok());
        assert!(validate_access_mode("domain").is_ok());
        assert!(validate_access_mode("relay").is_ok());
        assert_eq!(
            validate_access_mode("tunnel").unwrap_err(),
            AgentValidationError::InvalidAccessMode
        );
    }

    #[test]
    fn test_token_hash_generation() {
        let token = "test-token-123";
        let hash1 = hash_token(token);
        let hash2 = hash_token(token);

        assert_eq!(hash1, hash2); // same input = same hash
        assert_ne!(hash1, token); // hash != plain token
    }

    #[test]
    fn test_token_validation() {
        assert!(validate_token("test-token-123").is_ok());
        assert_eq!(
            validate_token("").unwrap_err(),
            AgentValidationError::EmptyToken
        );
    }

    #[test]
    fn test_agent_name_validation() {
        assert!(validate_agent_name("my-agent").is_ok());
        assert!(validate_agent_name("agent_123").is_ok());
        assert!(validate_agent_name("production-server").is_ok());
        assert_eq!(
            validate_agent_name("").unwrap_err(),
            AgentValidationError::InvalidName
        );
        assert_eq!(
            validate_agent_name("   ").unwrap_err(),
            AgentValidationError::InvalidName
        );
    }

    #[test]
    fn test_last_seen_calculation() {
        use chrono::{Duration, Utc};

        let now = Utc::now();
        let recent = now - Duration::minutes(5);
        let old = now - Duration::hours(2);

        assert!(is_agent_online_at(Some(recent), now));
        assert!(!is_agent_online_at(Some(old), now));
        assert!(!is_agent_online_at(None, now));
    }
}
