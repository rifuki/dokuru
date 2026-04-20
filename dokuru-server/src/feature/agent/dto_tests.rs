#[cfg(test)]
mod tests {
    use super::super::dto::*;
    use validator::Validate;

    #[test]
    fn test_create_agent_dto_valid() {
        let dto = CreateAgentDto {
            name: "Test Agent".to_string(),
            url: "http://localhost:8080".to_string(),
            token: "test-token-123".to_string(),
            access_mode: "direct".to_string(),
        };
        assert!(dto.validate().is_ok());
    }

    #[test]
    fn test_create_agent_dto_relay_mode() {
        let dto = CreateAgentDto {
            name: "Relay Agent".to_string(),
            url: "relay".to_string(),
            token: "test-token".to_string(),
            access_mode: "relay".to_string(),
        };
        assert!(dto.validate().is_ok());
    }

    #[test]
    fn test_create_agent_dto_empty_name() {
        let dto = CreateAgentDto {
            name: "".to_string(),
            url: "http://localhost:8080".to_string(),
            token: "test-token".to_string(),
            access_mode: "direct".to_string(),
        };
        assert!(dto.validate().is_err());
    }

    #[test]
    fn test_create_agent_dto_name_too_long() {
        let dto = CreateAgentDto {
            name: "a".repeat(256),
            url: "http://localhost:8080".to_string(),
            token: "test-token".to_string(),
            access_mode: "direct".to_string(),
        };
        assert!(dto.validate().is_err());
    }

    #[test]
    fn test_create_agent_dto_invalid_url() {
        let dto = CreateAgentDto {
            name: "Test Agent".to_string(),
            url: "not-a-valid-url".to_string(),
            token: "test-token".to_string(),
            access_mode: "direct".to_string(),
        };
        assert!(dto.validate().is_err());
    }

    #[test]
    fn test_create_agent_dto_empty_token() {
        let dto = CreateAgentDto {
            name: "Test Agent".to_string(),
            url: "http://localhost:8080".to_string(),
            token: "".to_string(),
            access_mode: "direct".to_string(),
        };
        assert!(dto.validate().is_err());
    }

    #[test]
    fn test_create_agent_dto_invalid_access_mode() {
        let dto = CreateAgentDto {
            name: "Test Agent".to_string(),
            url: "http://localhost:8080".to_string(),
            token: "test-token".to_string(),
            access_mode: "invalid".to_string(),
        };
        assert!(dto.validate().is_err());
    }

    #[test]
    fn test_create_agent_dto_all_access_modes() {
        for mode in &["direct", "cloudflare", "domain", "relay"] {
            let dto = CreateAgentDto {
                name: "Test Agent".to_string(),
                url: if *mode == "relay" {
                    "relay".to_string()
                } else {
                    "http://localhost:8080".to_string()
                },
                token: "test-token".to_string(),
                access_mode: mode.to_string(),
            };
            assert!(dto.validate().is_ok(), "Failed for mode: {}", mode);
        }
    }

    #[test]
    fn test_update_agent_dto_valid() {
        let dto = UpdateAgentDto {
            name: "Updated Agent".to_string(),
            url: "http://localhost:9090".to_string(),
            token: Some("new-token".to_string()),
        };
        assert!(dto.validate().is_ok());
    }

    #[test]
    fn test_update_agent_dto_no_token() {
        let dto = UpdateAgentDto {
            name: "Updated Agent".to_string(),
            url: "http://localhost:9090".to_string(),
            token: None,
        };
        assert!(dto.validate().is_ok());
    }

    #[test]
    fn test_update_agent_dto_empty_name() {
        let dto = UpdateAgentDto {
            name: "".to_string(),
            url: "http://localhost:9090".to_string(),
            token: None,
        };
        assert!(dto.validate().is_err());
    }

    #[test]
    fn test_update_agent_dto_invalid_url() {
        let dto = UpdateAgentDto {
            name: "Updated Agent".to_string(),
            url: "invalid-url".to_string(),
            token: None,
        };
        assert!(dto.validate().is_err());
    }
}
