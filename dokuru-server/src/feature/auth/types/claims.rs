use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Admin,
    User,
}

impl fmt::Display for Role {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Role::Admin => write!(f, "admin"),
            Role::User => write!(f, "user"),
        }
    }
}

impl TryFrom<&str> for Role {
    type Error = ();
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s {
            "admin" => Ok(Role::Admin),
            "user" => Ok(Role::User),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TokenType {
    Access,
    Refresh,
}

impl fmt::Display for TokenType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TokenType::Access => write!(f, "access"),
            TokenType::Refresh => write!(f, "refresh"),
        }
    }
}

/// JWT Claims with session tracking
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Claims {
    pub sub: String,           // Subject (user ID)
    pub jti: String,           // JWT ID (unique per token, enables revocation)
    pub exp: i64,              // Expiration time
    pub iat: i64,              // Issued at
    pub roles: Vec<Role>,      // User roles
    pub token_type: TokenType, // access or refresh
    pub sid: String,           // Session ID (shared across tokens in same session)
    pub s_iat: i64,            // Session issued at (for absolute timeout)
}

/// Authenticated user extracted from JWT
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: uuid::Uuid,
    pub email: String,
    pub roles: Vec<Role>,
    pub session_id: String, // Added for session management
}
