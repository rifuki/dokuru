use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use uuid::Uuid;

use crate::feature::auth::types::claims::{Claims, Role, TokenType};
use crate::infrastructure::config::auth_runtime;

fn access_secret() -> Vec<u8> {
    auth_runtime().access_secret.clone().into_bytes()
}

fn refresh_secret() -> Vec<u8> {
    auth_runtime().refresh_secret.clone().into_bytes()
}

fn access_expiry_secs() -> i64 {
    auth_runtime().access_expiry_secs
}

fn refresh_expiry_secs() -> i64 {
    auth_runtime().refresh_expiry_secs
}

/// JWT Error types
#[derive(Debug, thiserror::Error)]
pub enum JwtError {
    #[error("Token has expired")]
    Expired,
    #[error("Invalid token")]
    Invalid,
    #[error("Wrong token type")]
    WrongType,
    #[error("Token creation failed")]
    CreationFailed,
    #[error("Session expired - absolute timeout reached")]
    SessionExpired,
}

impl From<jsonwebtoken::errors::Error> for JwtError {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        match err.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => Self::Expired,
            _ => Self::Invalid,
        }
    }
}

/// Token pair response
#[derive(Debug, Clone)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64, // Access token expiry in seconds
    pub session_id: String,
    pub session_iat: i64,
}

/// Create token pair with existing session (for refresh)
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn create_token_pair_with_session(
    user_id: Uuid,
    _email: &str,
    roles: &[Role],
    session_id: &str,
    session_iat: i64,
) -> Result<TokenPair, JwtError> {
    let access_token = create_access_token_with_session(user_id, roles, session_id, session_iat)?;
    let refresh_token = create_refresh_token_with_session(user_id, session_id, session_iat)?;

    Ok(TokenPair {
        access_token,
        refresh_token,
        expires_in: access_expiry_secs(),
        session_id: session_id.to_string(),
        session_iat,
    })
}

/// Create access token (short-lived)
///
/// # Arguments
/// * `user_id` - User UUID
/// * `roles` - User roles
/// * `session_id` - Session ID (shared with refresh token)
/// * `session_iat` - Session issued at (for absolute timeout)
fn create_access_token_with_session(
    user_id: Uuid,
    roles: &[Role],
    session_id: &str,
    session_iat: i64,
) -> Result<String, JwtError> {
    let now = Utc::now();
    let expiry = access_expiry_secs();
    let exp = now + Duration::seconds(expiry);

    let claims = Claims {
        sub: user_id.to_string(),
        jti: Uuid::new_v4().to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
        roles: roles.to_vec(),
        token_type: TokenType::Access,
        sid: session_id.to_string(),
        s_iat: session_iat,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(&access_secret()),
    )
    .map_err(|_| JwtError::CreationFailed)
}

/// Create refresh token (long-lived)
///
/// # Arguments
/// * `user_id` - User UUID
/// * `session_id` - Session ID (shared with access token)
/// * `session_iat` - Session issued at (for absolute timeout)
fn create_refresh_token_with_session(
    user_id: Uuid,
    session_id: &str,
    session_iat: i64,
) -> Result<String, JwtError> {
    let now = Utc::now();
    let expiry = refresh_expiry_secs();
    let exp = now + Duration::seconds(expiry);

    let claims = Claims {
        sub: user_id.to_string(),
        jti: Uuid::new_v4().to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
        roles: vec![], // Refresh tokens don't need roles
        token_type: TokenType::Refresh,
        sid: session_id.to_string(),
        s_iat: session_iat,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(&refresh_secret()),
    )
    .map_err(|_| JwtError::CreationFailed)
}

/// Create both tokens with session tracking
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn create_token_pair(
    user_id: Uuid,
    _email: &str,
    roles: &[Role],
) -> Result<TokenPair, JwtError> {
    let session_id = Uuid::new_v4().to_string();
    let session_iat = Utc::now().timestamp();

    let access_token = create_access_token_with_session(user_id, roles, &session_id, session_iat)?;
    let refresh_token = create_refresh_token_with_session(user_id, &session_id, session_iat)?;

    Ok(TokenPair {
        access_token,
        refresh_token,
        expires_in: access_expiry_secs(),
        session_id,
        session_iat,
    })
}

/// Validate access token
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn validate_access_token(token: &str) -> Result<Claims, JwtError> {
    let validation = Validation::default();

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(&access_secret()),
        &validation,
    )?;

    if token_data.claims.token_type != TokenType::Access {
        return Err(JwtError::WrongType);
    }

    Ok(token_data.claims)
}

/// Validate refresh token with absolute session timeout check
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn validate_refresh_token(token: &str) -> Result<Claims, JwtError> {
    let validation = Validation::default();

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(&refresh_secret()),
        &validation,
    )?;

    if token_data.claims.token_type != TokenType::Refresh {
        return Err(JwtError::WrongType);
    }

    // Check absolute session timeout (7 days from session start)
    let max_session_duration = refresh_expiry_secs();
    let now = Utc::now().timestamp();

    if now > token_data.claims.s_iat + max_session_duration {
        return Err(JwtError::SessionExpired);
    }

    Ok(token_data.claims)
}

/// Extract user ID from claims
/// # Errors
///
/// Returns an error if the underlying operation fails.
pub fn extract_user_id(claims: &Claims) -> Result<Uuid, JwtError> {
    Uuid::parse_str(&claims.sub).map_err(|_| JwtError::Invalid)
}

/// Extract session ID from claims
#[must_use]
pub fn extract_session_id(claims: &Claims) -> String {
    claims.sid.clone()
}
#[cfg(test)]
mod tests {
    use super::{
        JwtError, create_token_pair, create_token_pair_with_session, extract_session_id,
        extract_user_id, validate_access_token, validate_refresh_token,
    };
    use crate::feature::auth::types::claims::{Role, TokenType};
    use std::env;
    use uuid::Uuid;

    fn setup_test_env() {
        use std::sync::Once;
        static INIT: Once = Once::new();

        INIT.call_once(|| {
            unsafe {
                env::set_var(
                    "JWT_ACCESS_SECRET",
                    "test-access-secret-key-at-least-32-chars",
                );
                env::set_var(
                    "JWT_REFRESH_SECRET",
                    "test-refresh-secret-key-at-least-32-chars",
                );
                env::set_var("JWT_ACCESS_EXPIRY_SECS", "3600");
                env::set_var("JWT_REFRESH_EXPIRY_SECS", "86400");
            }

            let auth_config = crate::infrastructure::config::AuthConfig {
                access_secret: "test-access-secret-key-at-least-32-chars".to_string(),
                refresh_secret: "test-refresh-secret-key-at-least-32-chars".to_string(),
                access_expiry_secs: 3600,
                refresh_expiry_secs: 86400,
            };

            let _ = crate::infrastructure::config::AUTH_RUNTIME.set(auth_config);
        });
    }

    #[test]
    fn test_create_token_pair() {
        setup_test_env();
        let user_id = Uuid::new_v4();
        let email = "test@example.com";
        let roles = vec![Role::User];

        let result = create_token_pair(user_id, email, &roles);
        assert!(result.is_ok());

        let token_pair = result.unwrap();
        assert!(!token_pair.access_token.is_empty());
        assert!(!token_pair.refresh_token.is_empty());
        assert_ne!(token_pair.access_token, token_pair.refresh_token);
        assert_eq!(token_pair.expires_in, 3600);
        assert!(!token_pair.session_id.is_empty());
    }

    #[test]
    fn test_validate_access_token_valid() {
        setup_test_env();
        let user_id = Uuid::new_v4();
        let roles = vec![Role::User];

        let token_pair = create_token_pair(user_id, "test@example.com", &roles).unwrap();

        let claims = validate_access_token(&token_pair.access_token);
        assert!(claims.is_ok());

        let claims = claims.unwrap();
        assert_eq!(claims.sub, user_id.to_string());
        assert_eq!(claims.token_type, TokenType::Access);
        assert_eq!(claims.roles, roles);
    }

    #[test]
    fn test_validate_access_token_invalid() {
        setup_test_env();
        let result = validate_access_token("invalid.token.here");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_refresh_token_valid() {
        setup_test_env();
        let user_id = Uuid::new_v4();
        let roles = vec![Role::User];

        let token_pair = create_token_pair(user_id, "test@example.com", &roles).unwrap();

        let claims = validate_refresh_token(&token_pair.refresh_token);
        assert!(claims.is_ok());

        let claims = claims.unwrap();
        assert_eq!(claims.sub, user_id.to_string());
        assert_eq!(claims.token_type, TokenType::Refresh);
    }

    #[test]
    fn test_validate_refresh_token_invalid() {
        setup_test_env();
        let result = validate_refresh_token("invalid.refresh.token");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_wrong_token_type() {
        setup_test_env();
        let user_id = Uuid::new_v4();
        let roles = vec![Role::User];

        let token_pair = create_token_pair(user_id, "test@example.com", &roles).unwrap();

        // Try to validate access token as refresh token (fails due to wrong secret)
        let result = validate_refresh_token(&token_pair.access_token);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), JwtError::Invalid));

        // Try to validate refresh token as access token (fails due to wrong secret)
        let result = validate_access_token(&token_pair.refresh_token);
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), JwtError::Invalid));
    }

    #[test]
    fn test_extract_user_id() {
        setup_test_env();
        let user_id = Uuid::new_v4();
        let roles = vec![Role::User];

        let token_pair = create_token_pair(user_id, "test@example.com", &roles).unwrap();
        let claims = validate_access_token(&token_pair.access_token).unwrap();

        let extracted_id = extract_user_id(&claims);
        assert!(extracted_id.is_ok());
        assert_eq!(extracted_id.unwrap(), user_id);
    }

    #[test]
    fn test_extract_session_id() {
        setup_test_env();
        let user_id = Uuid::new_v4();
        let roles = vec![Role::User];

        let token_pair = create_token_pair(user_id, "test@example.com", &roles).unwrap();
        let claims = validate_access_token(&token_pair.access_token).unwrap();

        let session_id = extract_session_id(&claims);
        assert_eq!(session_id, token_pair.session_id);
    }

    #[test]
    fn test_create_token_pair_with_session() {
        setup_test_env();
        let user_id = Uuid::new_v4();
        let email = "test@example.com";
        let roles = vec![Role::Admin];
        let session_id = Uuid::new_v4().to_string();
        let session_iat = chrono::Utc::now().timestamp();

        let result =
            create_token_pair_with_session(user_id, email, &roles, &session_id, session_iat);
        assert!(result.is_ok());

        let token_pair = result.unwrap();
        assert_eq!(token_pair.session_id, session_id);
        assert_eq!(token_pair.session_iat, session_iat);

        // Validate tokens have correct session info
        let access_claims = validate_access_token(&token_pair.access_token).unwrap();
        assert_eq!(access_claims.sid, session_id);
        assert_eq!(access_claims.s_iat, session_iat);
    }

    #[test]
    fn test_multiple_roles() {
        setup_test_env();
        let user_id = Uuid::new_v4();
        let roles = vec![Role::User, Role::Admin];

        let token_pair = create_token_pair(user_id, "admin@example.com", &roles).unwrap();
        let claims = validate_access_token(&token_pair.access_token).unwrap();

        assert_eq!(claims.roles.len(), 2);
        assert!(claims.roles.contains(&Role::User));
        assert!(claims.roles.contains(&Role::Admin));
    }

    #[test]
    fn test_different_users_different_tokens() {
        setup_test_env();
        let user1 = Uuid::new_v4();
        let user2 = Uuid::new_v4();
        let roles = vec![Role::User];

        let token1 = create_token_pair(user1, "user1@example.com", &roles).unwrap();
        let token2 = create_token_pair(user2, "user2@example.com", &roles).unwrap();

        assert_ne!(token1.access_token, token2.access_token);
        assert_ne!(token1.refresh_token, token2.refresh_token);
        assert_ne!(token1.session_id, token2.session_id);

        let claims1 = validate_access_token(&token1.access_token).unwrap();
        let claims2 = validate_access_token(&token2.access_token).unwrap();

        assert_eq!(extract_user_id(&claims1).unwrap(), user1);
        assert_eq!(extract_user_id(&claims2).unwrap(), user2);
    }
}
