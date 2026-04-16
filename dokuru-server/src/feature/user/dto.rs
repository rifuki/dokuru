use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

/// DTO for creating a user (used by auth register)
#[derive(Debug, Deserialize)]
pub struct CreateUser {
    pub email: String,
    pub username: Option<String>, // Optional during registration
    pub name: String,
    pub password: String,
}

/// DTO for updating a user profile
#[derive(Debug, Deserialize)]
pub struct UpdateUser {
    pub name: Option<String>,
    pub username: Option<String>,
    pub email: Option<String>,
}

/// Public user profile (no sensitive fields)
#[derive(Debug, Serialize)]
pub struct UserProfileResponse {
    pub id: Uuid,
    pub email: String,
    pub username: Option<String>,
    pub name: String,
    pub avatar_url: Option<String>,
    pub role: String,
}

/// Update profile request
#[derive(Debug, Deserialize, Validate)]
pub struct UpdateProfileRequest {
    #[validate(length(min = 3, message = "Name must be at least 3 characters"))]
    pub name: Option<String>,

    #[validate(length(
        min = 3,
        max = 50,
        message = "Username must be between 3 and 50 characters"
    ))]
    pub username: Option<String>,

    #[validate(email(message = "Invalid email format"))]
    pub email: Option<String>,
}
