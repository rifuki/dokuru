use serde::{Deserialize, Serialize};
use validator::Validate;

/// Login credentials
#[derive(Debug, Deserialize)]
pub struct LoginCredentials {
    pub username: String,
    pub password: String,
}

/// Register request
#[derive(Debug, Clone, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(
        min = 3,
        max = 50,
        message = "Username must be between 3 and 50 characters"
    ))]
    pub username: Option<String>,

    #[validate(length(min = 3, message = "Name must be at least 3 characters"))]
    pub name: Option<String>,

    #[validate(length(min = 6, message = "Password must be at least 6 characters"))]
    pub password: String,
}

/// Login request
#[derive(Debug, Clone, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,

    #[validate(length(min = 1, message = "Password is required"))]
    pub password: String,
}

/// User response (without sensitive data)
#[derive(Debug, Clone, Serialize)]
pub struct UserResponse {
    pub id: uuid::Uuid,
    pub email: String,
    pub username: Option<String>,
    pub name: String,
    pub avatar_url: Option<String>,
    pub role: String,
}

/// Token response (access token only — refresh token is in httpOnly cookie)
#[derive(Debug, Clone, Serialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub expires_in: i64, // in seconds
}

/// Auth response
#[derive(Debug, Clone, Serialize)]
pub struct AuthResponse {
    pub user: UserResponse,
    pub token: TokenResponse,
}

/// Request body for change password
#[derive(Debug, Deserialize, Validate)]
pub struct ChangePasswordRequest {
    #[validate(length(min = 1, message = "Current password is required"))]
    pub current_password: String,

    #[validate(length(min = 8, message = "New password must be at least 8 characters"))]
    pub new_password: String,
}

/// Hash password using Argon2
pub fn hash_password(
    password: &str,
) -> Result<String, crate::feature::auth::repository::AuthError> {
    crate::feature::auth::domain::hash_password(password)
        .map_err(|_| crate::feature::auth::repository::AuthError::HashError)
}
