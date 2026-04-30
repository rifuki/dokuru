pub const MIN_USERNAME_LEN: usize = 3;
pub const MAX_USERNAME_LEN: usize = 50;
pub const MIN_PASSWORD_LEN: usize = 8;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AuthValidationError {
    #[error("Invalid email format")]
    InvalidEmail,
    #[error("Username must be between 3 and 50 characters")]
    InvalidUsernameLength,
    #[error("Username can only contain letters, numbers, underscores, or hyphens")]
    InvalidUsernameCharacters,
    #[error("Password must be at least 8 characters")]
    PasswordTooShort,
    #[error("Token length must be greater than zero")]
    InvalidTokenLength,
    #[error("Password hashing failed")]
    HashError,
    #[error("Password hash is invalid")]
    InvalidHash,
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn validate_email(email: &str) -> Result<(), AuthValidationError> {
    let Some((local, domain)) = email.split_once('@') else {
        return Err(AuthValidationError::InvalidEmail);
    };

    if local.is_empty() || domain.is_empty() || !domain.contains('.') || email.contains(' ') {
        return Err(AuthValidationError::InvalidEmail);
    }

    Ok(())
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn validate_username(username: &str) -> Result<(), AuthValidationError> {
    let len = username.chars().count();
    if !(MIN_USERNAME_LEN..=MAX_USERNAME_LEN).contains(&len) {
        return Err(AuthValidationError::InvalidUsernameLength);
    }

    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
    {
        return Err(AuthValidationError::InvalidUsernameCharacters);
    }

    Ok(())
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn validate_password(password: &str) -> Result<(), AuthValidationError> {
    if password.chars().count() < MIN_PASSWORD_LEN {
        Err(AuthValidationError::PasswordTooShort)
    } else {
        Ok(())
    }
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn generate_token_hex(length: usize) -> Result<String, AuthValidationError> {
    if length == 0 {
        return Err(AuthValidationError::InvalidTokenLength);
    }

    let bytes: Vec<u8> = (0..length).map(|_| rand::random::<u8>()).collect();
    Ok(hex::encode(bytes))
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn hash_password(password: &str) -> Result<String, AuthValidationError> {
    use argon2::{
        Argon2, PasswordHasher,
        password_hash::{SaltString, rand_core::OsRng},
    };

    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| AuthValidationError::HashError)
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, AuthValidationError> {
    use argon2::{
        Argon2,
        password_hash::{PasswordHash, PasswordVerifier},
    };

    let parsed_hash = PasswordHash::new(hash).map_err(|_| AuthValidationError::InvalidHash)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_email_shape() {
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
    fn validates_username_policy() {
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
    fn validates_password_length_policy() {
        assert!(validate_password("password123").is_ok());
        assert!(validate_password("StrongP@ss123").is_ok());
        assert_eq!(
            validate_password("weak").unwrap_err(),
            AuthValidationError::PasswordTooShort
        );
    }

    #[test]
    fn generates_hex_tokens() {
        let token1 = generate_token_hex(32).unwrap();
        let token2 = generate_token_hex(32).unwrap();

        assert_eq!(token1.len(), 64);
        assert_eq!(token2.len(), 64);
        assert_ne!(token1, token2);
    }

    #[test]
    fn rejects_zero_length_tokens() {
        assert_eq!(
            generate_token_hex(0).unwrap_err(),
            AuthValidationError::InvalidTokenLength
        );
    }

    #[test]
    fn hashes_and_verifies_passwords() {
        let password = "TestPassword123!";
        let hash = hash_password(password).unwrap();

        assert_ne!(hash, password);
        assert!(hash.starts_with("$argon2"));
        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("WrongPassword", &hash).unwrap());
    }
}
