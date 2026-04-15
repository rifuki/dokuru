use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Token {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    #[serde(skip)]
    pub token_hash: String,
    pub created_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateTokenDto {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct TokenResponse {
    pub id: Uuid,
    pub name: String,
    pub token: String, // Only returned once during creation
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct TokenListItem {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
}

impl From<Token> for TokenListItem {
    fn from(token: Token) -> Self {
        Self {
            id: token.id,
            name: token.name,
            created_at: token.created_at,
            last_used: token.last_used,
        }
    }
}
