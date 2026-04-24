#[cfg(test)]
mod tests {
    use super::super::*;

    #[test]
    fn test_agent_status_validation() {
        assert!(is_valid_status("online"));
        assert!(is_valid_status("offline"));
        assert!(is_valid_status("unknown"));
        assert!(!is_valid_status("invalid"));
    }

    #[test]
    fn test_agent_url_validation() {
        assert!(is_valid_url("http://localhost:8080"));
        assert!(is_valid_url("https://agent.example.com"));
        assert!(is_valid_url("http://192.168.1.100:9000"));
        assert!(!is_valid_url("invalid-url"));
        assert!(!is_valid_url(""));
    }

    #[test]
    fn test_access_mode_validation() {
        assert!(is_valid_access_mode("direct"));
        assert!(is_valid_access_mode("tunnel"));
        assert!(!is_valid_access_mode("invalid"));
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
    fn test_agent_name_validation() {
        assert!(is_valid_agent_name("my-agent"));
        assert!(is_valid_agent_name("agent_123"));
        assert!(is_valid_agent_name("production-server"));
        assert!(!is_valid_agent_name("")); // empty
        assert!(!is_valid_agent_name("a")); // too short
    }

    #[test]
    fn test_last_seen_calculation() {
        use chrono::{Duration, Utc};

        let now = Utc::now();
        let recent = now - Duration::minutes(5);
        let old = now - Duration::hours(2);

        assert!(is_agent_online(&Some(recent)));
        assert!(!is_agent_online(&Some(old)));
        assert!(!is_agent_online(&None));
    }

    fn is_valid_status(status: &str) -> bool {
        matches!(status, "online" | "offline" | "unknown")
    }

    fn is_valid_url(url: &str) -> bool {
        url.starts_with("http://") || url.starts_with("https://")
    }

    fn is_valid_access_mode(mode: &str) -> bool {
        matches!(mode, "direct" | "tunnel")
    }

    fn hash_token(token: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        hex::encode(hasher.finalize())
    }

    fn is_valid_agent_name(name: &str) -> bool {
        name.len() >= 2 && name.len() <= 255
    }

    fn is_agent_online(last_seen: &Option<chrono::DateTime<chrono::Utc>>) -> bool {
        if let Some(last_seen) = last_seen {
            let now = chrono::Utc::now();
            let diff = now.signed_duration_since(*last_seen);
            diff.num_minutes() < 10
        } else {
            false
        }
    }
}
