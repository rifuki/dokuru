use axum::{Json, extract::State, http::StatusCode, Extension};
use axum_extra::extract::cookie::CookieJar;
use validator::Validate;

use crate::{
    feature::auth::{
        claims::AuthUser,
        cookie::REFRESH_TOKEN_COOKIE,
        dto::{AuthResponse, ChangePasswordRequest, LoginCredentials, RegisterRequest, TokenResponse, UserResponse},
        repository::AuthError,
    },
    feature::user::CreateUser,
    infrastructure::web::response::{
        ApiError, ApiResult, ApiSuccess,
        codes::{auth as auth_codes, validation as val_codes},
    },
    state::AppState,
};

/// POST /api/v1/auth/register
pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> ApiResult<AuthResponse> {
    if let Err(e) = req.validate() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(val_codes::INVALID_INPUT)
            .with_message(format!("Validation error: {}", e)));
    }

    let create_user = CreateUser {
        email: req.email,
        username: req.username,
        name: req.name,
        password: req.password,
    };

    let (response, refresh_cookie) =
        state
            .auth_service
            .register(create_user)
            .await
            .map_err(|e: AuthError| {
                ApiError::default()
                    .with_code(StatusCode::BAD_REQUEST)
                    .with_error_code(auth_codes::EMAIL_EXISTS)
                    .with_message(e.to_string())
            })?;

    Ok(ApiSuccess::default()
        .with_data(response)
        .with_cookie(refresh_cookie)
        .with_message("Registration successful"))
}

/// POST /api/v1/auth/login
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(creds): Json<LoginCredentials>,
) -> ApiResult<AuthResponse> {
    // Cek existing refresh token untuk menghindari concurrent login issues
    if let Some(_cookie) = jar.get(REFRESH_TOKEN_COOKIE) {
        // Clear existing cookie - login akan generate token baru
        let _ = state.auth_service.logout();
    }

    let (response, refresh_cookie) = state
        .auth_service
        .login(creds)
        .await
        .map_err(|e: AuthError| match e {
            AuthError::InvalidCredentials => ApiError::default()
                .with_code(StatusCode::UNAUTHORIZED)
                .with_error_code(auth_codes::INVALID_CREDENTIALS)
                .with_message("Invalid email or password"),
            _ => ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Login failed"),
        })?;

    Ok(ApiSuccess::default()
        .with_data(response)
        .with_cookie(refresh_cookie)
        .with_message("Login successful"))
}

/// POST /api/v1/auth/refresh
pub async fn refresh(
    State(state): State<AppState>,
    jar: CookieJar,
) -> ApiResult<TokenResponse> {
    let refresh_token = jar
        .get(REFRESH_TOKEN_COOKIE)
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::UNAUTHORIZED)
                .with_error_code(auth_codes::UNAUTHORIZED)
                .with_message("Refresh token not found")
        })?
        .value();

    let (access_token, new_refresh_cookie) = state
        .auth_service
        .refresh_token(refresh_token)
        .await
        .map_err(|e: AuthError| match e {
            AuthError::InvalidCredentials => ApiError::default()
                .with_code(StatusCode::UNAUTHORIZED)
                .with_error_code(auth_codes::TOKEN_EXPIRED)
                .with_message("Refresh token expired"),
            _ => ApiError::default()
                .with_code(StatusCode::UNAUTHORIZED)
                .with_error_code(auth_codes::TOKEN_INVALID)
                .with_message("Invalid refresh token"),
        })?;

    Ok(ApiSuccess::default()
        .with_data(access_token)
        .with_cookie(new_refresh_cookie)
        .with_message("Token refreshed"))
}

/// POST /api/v1/auth/logout
pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> ApiResult<()> {
    let _ = jar.get(REFRESH_TOKEN_COOKIE);

    let clear_cookie = crate::feature::auth::cookie::create_cleared_cookie(&state.config);

    Ok(ApiSuccess::default()
        .with_cookie(clear_cookie)
        .with_message("Logout successful"))
}

/// GET /api/v1/auth/me
pub async fn me(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<UserResponse> {
    let user = state
        .user_repo
        .find_by_id(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|_| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to fetch user")
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(auth_codes::USER_NOT_FOUND)
                .with_message("User not found")
        })?;
    
    let user_role = user.role().to_string();
    let response = UserResponse {
        id: user.id,
        email: user.email.clone(),
        username: user.username.clone(),
        name: user.name.clone(),
        role: user_role,
    };
    
    Ok(ApiSuccess::default()
        .with_data(response)
        .with_message("User info retrieved"))
}

/// POST /api/v1/auth/change-password
pub async fn change_password(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<ChangePasswordRequest>,
) -> ApiResult<()> {
    // Validate new password length
    if req.new_password.len() < 8 {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(val_codes::INVALID_INPUT)
            .with_message("New password must be at least 8 characters"));
    }

    // Get user from database
    let user = state
        .user_repo
        .find_by_id(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|_| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to fetch user")
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(auth_codes::USER_NOT_FOUND)
                .with_message("User not found")
        })?;

    // Verify current password
    use argon2::{Argon2, PasswordHash, PasswordVerifier};
    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|_| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Invalid password hash")
        })?;
    
    Argon2::default()
        .verify_password(req.current_password.as_bytes(), &parsed_hash)
        .map_err(|_| {
            ApiError::default()
                .with_code(StatusCode::UNAUTHORIZED)
                .with_error_code(auth_codes::INVALID_CREDENTIALS)
                .with_message("Current password is incorrect")
        })?;

    // Hash new password
    let new_password_hash = hash_password(&req.new_password)
        .map_err(|_| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to hash password")
        })?;

    // Update password in database
    state
        .user_repo
        .update_password(state.db.pool(), auth_user.user_id, &new_password_hash)
        .await
        .map_err(|_| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Failed to update password")
        })?;

    Ok(ApiSuccess::default()
        .with_message("Password changed successfully"))
}

/// Hash password using Argon2
fn hash_password(password: &str) -> Result<String, crate::feature::auth::repository::AuthError> {
    use argon2::{
        Argon2,
        password_hash::{PasswordHasher, SaltString, rand_core::OsRng},
    };
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| crate::feature::auth::repository::AuthError::HashError)
}

/// GET /api/v1/auth/sessions
pub async fn list_sessions(
    State(_state): State<AppState>,
    Extension(_auth_user): Extension<AuthUser>,
) -> ApiResult<Vec<serde_json::Value>> {
    // TODO: Implement session listing
    let sessions = vec![
        serde_json::json!({
            "id": "1",
            "device": "Chrome on macOS",
            "location": "Jakarta, Indonesia",
            "ip": "182.1.xxx.xxx",
            "created_at": chrono::Utc::now().to_rfc3339(),
            "is_current": true
        }),
        serde_json::json!({
            "id": "2", 
            "device": "Safari on iPhone",
            "location": "Jakarta, Indonesia",
            "ip": "182.1.xxx.xxx",
            "created_at": chrono::Utc::now().to_rfc3339(),
            "is_current": false
        }),
    ];
    
    Ok(ApiSuccess::default()
        .with_data(sessions)
        .with_message("Sessions retrieved"))
}

/// DELETE /api/v1/auth/sessions - Logout all sessions
pub async fn logout_all_sessions(
    State(_state): State<AppState>,
    Extension(_auth_user): Extension<AuthUser>,
) -> ApiResult<()> {
    // TODO: Implement logout all sessions
    Ok(ApiSuccess::default()
        .with_message("All sessions logged out"))
}

/// DELETE /api/v1/auth/sessions/:id - Revoke specific session
pub async fn revoke_session(
    State(_state): State<AppState>,
    Extension(_auth_user): Extension<AuthUser>,
) -> ApiResult<()> {
    // TODO: Implement revoke session
    Ok(ApiSuccess::default()
        .with_message("Session revoked"))
}
