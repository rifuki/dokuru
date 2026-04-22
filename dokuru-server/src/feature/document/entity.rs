use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Document {
    pub id: Uuid,
    pub name: String,
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
    pub uploaded_at: DateTime<Utc>,
}
