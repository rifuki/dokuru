use std::env;

use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use uuid::Uuid;

use crate::feature::auth::types::claims::{Claims, Role, TokenType};

fn access_secret() -> Vec<u8> {
    env::var("JWT_ACCESS_SECRET")
        .expect("JWT_ACCESS_SECRET must be set")
        .into_bytes()
}

fn refresh_secret() -> Vec<u8> {
    env::var("JWT_REFRESH_SECRET")
        .expect("JWT_REFRESH_SECRET must be set")
        .into_bytes()
}

fn access_expiry_secs() -> i64 {
    env::var("JWT_ACCESS_EXPIRY_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3600) // default 1 hour
}

fn refresh_expiry_secs() -> i64 {
    env::var("JWT_REFRESH_EXPIRY_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(604800) // default 7 days
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
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => JwtError::Expired,
            _ => JwtError::Invalid,
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
pub fn extract_user_id(claims: &Claims) -> Result<Uuid, JwtError> {
    Uuid::parse_str(&claims.sub).map_err(|_| JwtError::Invalid)
}

/// Extract session ID from claims
pub fn extract_session_id(claims: &Claims) -> String {
    claims.sid.clone()
}
