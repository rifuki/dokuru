#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn get_test_secret() -> String {
        "test-secret-key-at-least-32-chars-long-for-hs256".to_string()
    }

    #[test]
    fn test_create_token_pair() {
        let user_id = Uuid::new_v4();
        let secret = get_test_secret();
        
        let result = create_token_pair(user_id, &secret, 3600, 86400);
        assert!(result.is_ok());
        
        let (access_token, refresh_token) = result.unwrap();
        assert!(!access_token.is_empty());
        assert!(!refresh_token.is_empty());
        assert_ne!(access_token, refresh_token);
    }

    #[test]
    fn test_extract_user_id_valid_token() {
        let user_id = Uuid::new_v4();
        let secret = get_test_secret();
        
        let (access_token, _) = create_token_pair(user_id, &secret, 3600, 86400).unwrap();
        
        let extracted_id = extract_user_id(&access_token, &secret);
        assert!(extracted_id.is_ok());
        assert_eq!(extracted_id.unwrap(), user_id);
    }

    #[test]
    fn test_extract_user_id_invalid_token() {
        let secret = get_test_secret();
        let result = extract_user_id("invalid.token.here", &secret);
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_user_id_wrong_secret() {
        let user_id = Uuid::new_v4();
        let secret = get_test_secret();
        let wrong_secret = "wrong-secret-key-different-from-original";
        
        let (access_token, _) = create_token_pair(user_id, &secret, 3600, 86400).unwrap();
        
        let result = extract_user_id(&access_token, wrong_secret);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_refresh_token_valid() {
        let user_id = Uuid::new_v4();
        let secret = get_test_secret();
        
        let (_, refresh_token) = create_token_pair(user_id, &secret, 3600, 86400).unwrap();
        
        let result = validate_refresh_token(&refresh_token, &secret);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), user_id);
    }

    #[test]
    fn test_validate_refresh_token_invalid() {
        let secret = get_test_secret();
        let result = validate_refresh_token("invalid.refresh.token", &secret);
        assert!(result.is_err());
    }

    #[test]
    fn test_create_refresh_cookie() {
        let token = "test-refresh-token";
        let cookie = create_refresh_cookie(token, 86400);
        
        assert_eq!(cookie.name(), "refresh_token");
        assert_eq!(cookie.value(), token);
        assert!(cookie.http_only().unwrap());
        assert!(cookie.secure().unwrap());
        assert_eq!(cookie.same_site(), Some(axum_extra::extract::cookie::SameSite::Strict));
        assert_eq!(cookie.path(), Some("/"));
    }

    #[test]
    fn test_create_cleared_cookie() {
        let cookie = create_cleared_cookie();
        
        assert_eq!(cookie.name(), "refresh_token");
        assert_eq!(cookie.value(), "");
        assert!(cookie.http_only().unwrap());
        assert!(cookie.secure().unwrap());
        assert_eq!(cookie.max_age(), Some(time::Duration::seconds(0)));
    }

    #[test]
    fn test_token_expiration() {
        let user_id = Uuid::new_v4();
        let secret = get_test_secret();
        
        // Create token with very short expiration (1 second)
        let result = create_token_pair(user_id, &secret, 1, 1);
        assert!(result.is_ok());
        
        let (access_token, _) = result.unwrap();
        
        // Token should be valid immediately
        let extracted = extract_user_id(&access_token, &secret);
        assert!(extracted.is_ok());
        
        // Note: We can't easily test expiration without waiting or mocking time
        // This would require tokio::time::sleep(Duration::from_secs(2)) which is slow
    }

    #[test]
    fn test_multiple_tokens_different_users() {
        let secret = get_test_secret();
        let user1 = Uuid::new_v4();
        let user2 = Uuid::new_v4();
        
        let (token1, _) = create_token_pair(user1, &secret, 3600, 86400).unwrap();
        let (token2, _) = create_token_pair(user2, &secret, 3600, 86400).unwrap();
        
        assert_ne!(token1, token2);
        
        let extracted1 = extract_user_id(&token1, &secret).unwrap();
        let extracted2 = extract_user_id(&token2, &secret).unwrap();
        
        assert_eq!(extracted1, user1);
        assert_eq!(extracted2, user2);
        assert_ne!(extracted1, extracted2);
    }
}
