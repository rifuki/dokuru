use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::entity::ApiKey;

/// DTO for creating API key
#[derive(Debug, Deserialize)]
pub struct CreateApiKey {
    pub name: String,
    pub scopes: Vec<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

/// DTO for updating API key
#[derive(Debug, Deserialize)]
pub struct UpdateApiKey {
    pub name: Option<String>,
    pub scopes: Option<Vec<String>>,
    pub is_active: Option<bool>,
}

/// API Key response (without sensitive hash)
#[derive(Debug, Serialize)]
pub struct ApiKeyResponse {
    pub id: Uuid,
    pub name: String,
    pub scopes: Vec<String>,
    pub created_by: Option<Uuid>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

impl From<ApiKey> for ApiKeyResponse {
    fn from(key: ApiKey) -> Self {
        Self {
            id: key.id,
            name: key.name,
            scopes: key.scopes,
            created_by: key.created_by,
            last_used_at: key.last_used_at,
            expires_at: key.expires_at,
            is_active: key.is_active,
            created_at: key.created_at,
        }
    }
}

/// API Key with plain text (only returned once on creation)
#[derive(Debug, Serialize)]
pub struct ApiKeyWithPlain {
    pub id: Uuid,
    pub name: String,
    pub key: String, // Plain text key - only shown once!
    pub scopes: Vec<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Query params for listing API keys
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Request body for creating API key
#[derive(Debug, Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
    pub scopes: Vec<String>,
    pub created_by: Option<Uuid>,
    pub expires_days: Option<i64>,
}
