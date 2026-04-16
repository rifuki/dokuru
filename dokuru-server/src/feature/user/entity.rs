use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::feature::auth::types::Role;

/// User entity - Core identity (minimal, fast lookup)
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub username: Option<String>,
    pub is_active: bool,
    pub email_verified: bool,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    pub fn role(&self) -> Role {
        Role::try_from(self.role.as_str()).unwrap_or(Role::User)
    }
}

/// User profile entity - Extended profile information
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserProfile {
    pub id: Uuid,
    pub user_id: Uuid,

    // Personal Info
    pub full_name: Option<String>,
    pub display_name: Option<String>,
    pub date_of_birth: Option<chrono::NaiveDate>,
    pub gender: Option<String>,

    // Contact
    pub phone_number: Option<String>,
    pub phone_verified: bool,

    // Address
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub city: Option<String>,
    pub state_province: Option<String>,
    pub postal_code: Option<String>,
    pub country_code: Option<String>,

    // Profile Media
    pub avatar_url: Option<String>,
    pub cover_image_url: Option<String>,

    // Bio
    pub bio: Option<String>,
    pub website_url: Option<String>,

    // Preferences
    pub timezone: String,
    pub locale: String,

    // Social Links (stored as JSON string)
    pub social_links: serde_json::Value,

    // Privacy
    pub is_profile_public: bool,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Complete user with profile
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserWithProfile {
    pub id: Uuid,
    pub email: String,
    pub username: Option<String>,
    pub is_active: bool,
    pub email_verified: bool,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,

    // Profile fields
    pub full_name: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub phone_number: Option<String>,
}

impl UserWithProfile {
    pub fn role(&self) -> Role {
        Role::try_from(self.role.as_str()).unwrap_or(Role::User)
    }
}
