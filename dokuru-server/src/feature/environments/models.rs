use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, sqlx::Type)]
#[sqlx(type_name = "text")]
#[serde(rename_all = "lowercase")]
pub enum EnvironmentStatus {
    Online,
    Offline,
}

impl std::fmt::Display for EnvironmentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EnvironmentStatus::Online => write!(f, "online"),
            EnvironmentStatus::Offline => write!(f, "offline"),
        }
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Environment {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_id: Uuid,
    pub name: Option<String>,
    pub ip: Option<String>,
    pub docker_version: Option<String>,
    pub status: String,
    pub last_seen: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct EnvironmentResponse {
    pub id: Uuid,
    pub name: Option<String>,
    pub ip: Option<String>,
    pub docker_version: Option<String>,
    pub status: String,
    pub last_seen: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl From<Environment> for EnvironmentResponse {
    fn from(env: Environment) -> Self {
        Self {
            id: env.id,
            name: env.name,
            ip: env.ip,
            docker_version: env.docker_version,
            status: env.status,
            last_seen: env.last_seen,
            created_at: env.created_at,
        }
    }
}
