#[cfg(test)]
mod tests {
    use crate::feature::auth::domain::{
        AuthValidationError, generate_token_hex, hash_password, validate_email, validate_password,
        validate_username, verify_password,
    };

    #[test]
    fn test_email_validation() {
        assert!(validate_email("user@example.com").is_ok());
        assert!(validate_email("test.user@domain.co.uk").is_ok());
        assert_eq!(
            validate_email("invalid-email").unwrap_err(),
            AuthValidationError::InvalidEmail
        );
        assert_eq!(
            validate_email("@example.com").unwrap_err(),
            AuthValidationError::InvalidEmail
        );
        assert_eq!(
            validate_email("user@").unwrap_err(),
            AuthValidationError::InvalidEmail
        );
    }

    #[test]
    fn test_password_strength() {
        assert!(validate_password("StrongP@ss123").is_ok());
        assert!(validate_password("MyP@ssw0rd!").is_ok());
        assert!(validate_password("password123").is_ok());
        assert_eq!(
            validate_password("weak").unwrap_err(),
            AuthValidationError::PasswordTooShort
        );
    }

    #[test]
    fn test_username_validation() {
        assert!(validate_username("user123").is_ok());
        assert!(validate_username("test_user").is_ok());
        assert!(validate_username("user-name").is_ok());
        assert_eq!(
            validate_username("ab").unwrap_err(),
            AuthValidationError::InvalidUsernameLength
        );
        assert_eq!(
            validate_username("user@name").unwrap_err(),
            AuthValidationError::InvalidUsernameCharacters
        );
        assert_eq!(
            validate_username("user name").unwrap_err(),
            AuthValidationError::InvalidUsernameCharacters
        );
    }

    #[test]
    fn test_token_generation() {
        let token1 = generate_token_hex(32).unwrap();
        let token2 = generate_token_hex(32).unwrap();

        assert_eq!(token1.len(), 64); // hex encoded
        assert_eq!(token2.len(), 64);
        assert_ne!(token1, token2); // should be unique
    }

    #[test]
    fn test_hash_password() {
        let password = "TestPassword123!";
        let hash = hash_password(password).unwrap();

        assert!(!hash.is_empty());
        assert_ne!(hash, password);
        assert!(hash.starts_with("$argon2"));
    }

    #[test]
    fn test_verify_password() {
        let password = "TestPassword123!";
        let hash = hash_password(password).unwrap();

        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("WrongPassword", &hash).unwrap());
    }
}
