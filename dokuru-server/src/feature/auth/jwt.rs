use std::env;

use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use uuid::Uuid;

use crate::feature::auth::claims::{Claims, Role, TokenType};

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
}

/// Create access token (short-lived)
pub fn create_access_token(
    user_id: Uuid,
    _email: &str,
    roles: &[Role],
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
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(&access_secret()),
    )
    .map_err(|_| JwtError::CreationFailed)
}

/// Create refresh token (long-lived)
pub fn create_refresh_token(user_id: Uuid) -> Result<String, JwtError> {
    let now = Utc::now();
    let expiry = refresh_expiry_secs();
    let exp = now + Duration::seconds(expiry);

    let claims = Claims {
        sub: user_id.to_string(),
        jti: Uuid::new_v4().to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
        roles: vec![],
        token_type: TokenType::Refresh,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(&refresh_secret()),
    )
    .map_err(|_| JwtError::CreationFailed)
}

/// Create both tokens
pub fn create_token_pair(
    user_id: Uuid,
    email: &str,
    roles: &[Role],
) -> Result<TokenPair, JwtError> {
    let access_token = create_access_token(user_id, email, roles)?;
    let refresh_token = create_refresh_token(user_id)?;

    Ok(TokenPair {
        access_token,
        refresh_token,
        expires_in: access_expiry_secs(),
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

/// Validate refresh token
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

    Ok(token_data.claims)
}

/// Extract user ID from claims
pub fn extract_user_id(claims: &Claims) -> Result<Uuid, JwtError> {
    Uuid::parse_str(&claims.sub).map_err(|_| JwtError::Invalid)
}
