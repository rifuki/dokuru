use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "VARCHAR", rename_all = "lowercase")]
pub enum AuthProvider {
    Password,
    Google,
    Github,
    Discord,
    Twitter,
}

impl AuthProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthProvider::Password => "password",
            AuthProvider::Google => "google",
            AuthProvider::Github => "github",
            AuthProvider::Discord => "discord",
            AuthProvider::Twitter => "twitter",
        }
    }
}

impl TryFrom<&str> for AuthProvider {
    type Error = ();

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value.to_lowercase().as_str() {
            "password" => Ok(AuthProvider::Password),
            "google" => Ok(AuthProvider::Google),
            "github" => Ok(AuthProvider::Github),
            "discord" => Ok(AuthProvider::Discord),
            "twitter" => Ok(AuthProvider::Twitter),
            _ => Err(()),
        }
    }
}

/// Auth method entity - stores authentication credentials
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct AuthMethod {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub provider_id: Option<String>,
    #[serde(skip)]
    pub password_hash: Option<String>,
    #[serde(skip)]
    pub oauth_access_token: Option<String>,
    #[serde(skip)]
    pub oauth_refresh_token: Option<String>,
    pub oauth_expires_at: Option<DateTime<Utc>>,
    pub is_primary: bool,
    pub is_verified: bool,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl AuthMethod {
    pub fn is_password(&self) -> bool {
        self.provider == "password"
    }

    pub fn is_oauth(&self) -> bool {
        self.provider != "password"
    }

    pub fn verify_password(&self, password: &str) -> Result<bool, argon2::password_hash::Error> {
        use argon2::{
            Argon2,
            password_hash::{PasswordHash, PasswordVerifier},
        };

        let Some(hash) = &self.password_hash else {
            return Ok(false);
        };

        let parsed = PasswordHash::new(hash)?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    }
}

/// Request to create password auth
#[derive(Debug, Clone)]
pub struct CreatePasswordAuth {
    pub user_id: Uuid,
    pub password_hash: String,
    pub is_primary: bool,
}

/// Request to create OAuth auth
#[derive(Debug, Clone)]
pub struct CreateOAuthAuth {
    pub user_id: Uuid,
    pub provider: AuthProvider,
    pub provider_id: String,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_primary: bool,
}
