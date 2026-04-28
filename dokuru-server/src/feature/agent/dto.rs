use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::domain;

#[derive(Debug, Deserialize, Validate)]
pub struct CreateAgentDto {
    #[validate(length(
        min = 1,
        max = 255,
        message = "Name must be between 1 and 255 characters"
    ))]
    pub name: String,

    #[validate(custom(function = "validate_agent_url"))]
    pub url: String,

    #[validate(length(min = 1, message = "Token is required"))]
    pub token: String,

    #[validate(custom(function = "validate_access_mode"))]
    pub access_mode: String,
}

fn validate_agent_url(url: &str) -> Result<(), validator::ValidationError> {
    domain::validate_agent_url(url).map_err(|error| {
        let mut err = validator::ValidationError::new("invalid_url");
        err.message = Some(error.to_string().into());
        err
    })
}

fn validate_access_mode(mode: &str) -> Result<(), validator::ValidationError> {
    domain::validate_access_mode(mode)
        .map(|_| ())
        .map_err(|error| {
            let mut err = validator::ValidationError::new("invalid_access_mode");
            err.message = Some(error.to_string().into());
            err
        })
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateAgentDto {
    #[validate(length(
        min = 1,
        max = 255,
        message = "Name must be between 1 and 255 characters"
    ))]
    pub name: String,

    #[validate(custom(function = "validate_agent_url"))]
    pub url: String,

    #[validate(custom(function = "validate_access_mode"))]
    pub access_mode: String,

    /// If provided, token will be re-hashed and updated
    pub token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AgentResponse {
    pub id: Uuid,
    pub name: String,
    pub url: String,
    pub access_mode: String,
    pub status: String,
    pub last_seen: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>, // Only returned on create
}
