use axum::{Extension, Json, extract::State, http::StatusCode};
use axum_extra::extract::cookie::CookieJar;
use validator::Validate;

use crate::{
    feature::auth::{
        repository::AuthError,
        session::DeviceInfo,
        types::{
            AuthResponse, AuthUser, LoginCredentials, RegisterRequest, TokenResponse, UserResponse,
        },
        utils::REFRESH_TOKEN_COOKIE,
    },
    infrastructure::web::response::{
        ApiError, ApiResult, ApiSuccess,
        codes::{auth as auth_codes, validation as val_codes},
    },
    state::AppState,
};

/// POST /api/v1/auth/register
pub async fn register(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<RegisterRequest>,
) -> ApiResult<AuthResponse> {
    if let Err(e) = req.validate() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(val_codes::INVALID_INPUT)
            .with_message(format!("Validation error: {e}")));
    }

    // Extract device info from headers
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("Unknown");

    let ip_address = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .or_else(|| headers.get("x-real-ip").and_then(|v| v.to_str().ok()))
        .unwrap_or("0.0.0.0");

    let device_info = DeviceInfo::from_user_agent(user_agent, ip_address);

    let mut register_data = crate::feature::auth::RegisterData::new(req.email.clone(), req.password.clone());
    
    if let Some(username) = req.username {
        register_data = register_data.with_username(username);
    }
    if let Some(name) = req.name {
        register_data = register_data.with_full_name(name);
    }
    register_data = register_data.with_device_info(device_info);

    let (response, refresh_cookie) = state
        .auth_service
        .register(register_data)
        .await
        .map_err(|e: AuthError| match e {
            AuthError::EmailExists => ApiError::default()
                .with_code(StatusCode::CONFLICT)
                .with_error_code(auth_codes::EMAIL_EXISTS)
                .with_message("Email already registered"),
            AuthError::UsernameExists => ApiError::default()
                .with_code(StatusCode::CONFLICT)
                .with_error_code(auth_codes::EMAIL_EXISTS)
                .with_message("Username already taken"),
            _ => ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message("Registration failed"),
        })?;

    // Send verification email (async, don't block registration)
    let state_clone = state.clone();
    let email = req.email.clone();
    let user_id = response.user.id;
    let origin = headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("http://localhost:5173")
        .to_string();

    tokio::spawn(async move {
        let token = uuid::Uuid::new_v4().to_string();
        let expires_at = chrono::Utc::now() + chrono::Duration::hours(24);

        if let Err(e) = state_clone
            .user_repo
            .set_verification_token(state_clone.db.pool(), user_id, &token, expires_at)
            .await
        {
            tracing::error!("Failed to set verification token: {}", e);
            return;
        }

        let verification_url = format!("{origin}/verify-email?token={token}");
        if let Err(e) = state_clone
            .email_service
            .send_verification_email(&email, &verification_url)
            .await
        {
            tracing::error!("Failed to send verification email: {}", e);
        }
    });

    Ok(ApiSuccess::default()
        .with_code(StatusCode::CREATED)
        .with_data(response)
        .with_cookie(refresh_cookie)
        .with_message("Registration successful"))
}

/// POST /api/v1/auth/login
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    headers: axum::http::HeaderMap,
    Json(creds): Json<LoginCredentials>,
) -> ApiResult<AuthResponse> {
    // Check existing refresh token to avoid concurrent login issues
    if let Some(_cookie) = jar.get(REFRESH_TOKEN_COOKIE) {
        let _ = state.auth_service.logout(None, None).await;
    }

    // Extract device info from headers
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("Unknown");

    let ip_address = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .or_else(|| headers.get("x-real-ip").and_then(|v| v.to_str().ok()))
        .unwrap_or("0.0.0.0");

    let device_info = DeviceInfo::from_user_agent(user_agent, ip_address);

    let login_creds = crate::feature::auth::LoginCreds::new(creds.username.clone(), creds.password.clone())
        .with_device_info(device_info);

    let (response, refresh_cookie) = state
        .auth_service
        .login(login_creds)
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
pub async fn refresh(State(state): State<AppState>, jar: CookieJar) -> ApiResult<TokenResponse> {
    let refresh_token = jar
        .get(REFRESH_TOKEN_COOKIE)
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::UNAUTHORIZED)
                .with_error_code(auth_codes::TOKEN_INVALID)
                .with_message("Refresh token not found")
        })?
        .value();

    let (access_token, new_refresh_cookie) = state
        .auth_service
        .refresh_token(refresh_token)
        .await
        .map_err(|e: AuthError| match e {
            AuthError::SessionExpired => ApiError::default()
                .with_code(StatusCode::UNAUTHORIZED)
                .with_error_code(auth_codes::TOKEN_EXPIRED)
                .with_message("Session expired, please login again"),
            AuthError::InvalidCredentials => ApiError::default()
                .with_code(StatusCode::UNAUTHORIZED)
                .with_error_code(auth_codes::TOKEN_EXPIRED)
                .with_message("Invalid or expired refresh token"),
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
    Extension(auth_user): Extension<AuthUser>,
    jar: CookieJar,
    headers: axum::http::HeaderMap,
) -> ApiResult<()> {
    let refresh_token = jar.get(REFRESH_TOKEN_COOKIE).map(|c| c.value().to_string());

    let access_token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    // Revoke current session in database
    let _ = state
        .auth_service
        .session_service()
        .revoke_by_session_id(&auth_user.session_id, "user_logout")
        .await;

    let clear_cookie = state
        .auth_service
        .logout(refresh_token.as_deref(), access_token)
        .await;

    Ok(ApiSuccess::default()
        .with_cookie(clear_cookie)
        .with_message("Logout successful"))
}

/// GET /api/v1/auth/me
pub async fn me(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<UserResponse> {
    let user_with_profile = state
        .auth_service
        .get_user_with_profile(auth_user.user_id)
        .await
        .map_err(|e| {
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_error_code(auth_codes::INTERNAL_ERROR)
                .with_message(format!("Database error: {e}"))
        })?
        .ok_or_else(|| {
            ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_error_code(auth_codes::USER_NOT_FOUND)
                .with_message("User not found")
        })?;

    let response = UserResponse {
        id: user_with_profile.id,
        email: user_with_profile.email,
        username: user_with_profile.username,
        name: user_with_profile.full_name.unwrap_or_default(),
        avatar_url: user_with_profile.avatar_url,
        role: user_with_profile.role,
    };

    Ok(ApiSuccess::default()
        .with_data(response)
        .with_message("User info retrieved"))
}
