use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::feature::auth::claims::Role;

/// User entity
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub username: Option<String>, // Can be null for existing users before migration
    pub name: String,
    #[serde(skip)]
    pub password_hash: String,
    pub role: String,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    pub fn new(email: &str, name: &str, password_hash: &str) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            email: email.to_string(),
            username: None, // Will be set separately if provided
            name: name.to_string(),
            password_hash: password_hash.to_string(),
            role: "user".to_string(),
            avatar_url: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn verify_password(&self, password: &str) -> Result<bool, argon2::password_hash::Error> {
        use argon2::{
            Argon2,
            password_hash::{PasswordHash, PasswordVerifier},
        };
        let parsed = PasswordHash::new(&self.password_hash)?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    }

    pub fn role(&self) -> Role {
        Role::try_from(self.role.as_str()).unwrap_or(Role::User)
    }
}
