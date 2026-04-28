use std::{
    net::{IpAddr, Ipv6Addr},
    time::Duration,
};

use axum::{
    Extension, Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use axum_extra::extract::cookie::CookieJar;
use serde::Deserialize;
use tokio::time::timeout;
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
    infrastructure::web::origin::frontend_origin,
    infrastructure::web::response::{
        ApiError, ApiResult, ApiSuccess,
        codes::{auth as auth_codes, validation as val_codes},
    },
    state::AppState,
};

#[derive(Debug, Deserialize)]
struct GeoIpResponse {
    city: Option<String>,
    region: Option<String>,
    country_name: Option<String>,
    country: Option<String>,
    error: Option<bool>,
}

async fn device_info_from_headers(headers: &HeaderMap) -> DeviceInfo {
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("Unknown");

    let ip_address = client_ip_from_headers(headers);
    let location = lookup_ip_location(&ip_address).await;

    DeviceInfo::from_user_agent(user_agent, &ip_address).with_location(location)
}

fn client_ip_from_headers(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(parse_ip_list)
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
                .and_then(parse_ip_candidate)
        })
        .or_else(|| {
            headers
                .get("forwarded")
                .and_then(|value| value.to_str().ok())
                .and_then(parse_forwarded_header)
        })
        .unwrap_or_else(|| "0.0.0.0".to_string())
}

fn parse_ip_list(value: &str) -> Option<String> {
    value.split(',').find_map(parse_ip_candidate)
}

fn parse_forwarded_header(value: &str) -> Option<String> {
    value.split(',').find_map(|entry| {
        entry.split(';').find_map(|part| {
            let (key, value) = part.trim().split_once('=')?;
            if key.eq_ignore_ascii_case("for") {
                parse_ip_candidate(value)
            } else {
                None
            }
        })
    })
}

fn parse_ip_candidate(value: &str) -> Option<String> {
    let candidate = value.trim().trim_matches('"');
    let host = if let Some(rest) = candidate.strip_prefix('[') {
        rest.split_once(']')?.0
    } else if candidate.matches(':').count() == 1 && candidate.contains('.') {
        candidate.rsplit_once(':')?.0
    } else {
        candidate
    };

    host.parse::<IpAddr>().ok().map(|ip| ip.to_string())
}

async fn lookup_ip_location(ip: &str) -> Option<String> {
    let ip_addr = ip.parse::<IpAddr>().ok()?;
    if !is_public_ip(ip_addr) {
        return None;
    }

    let lookup = async {
        let url = format!("https://ipapi.co/{ip}/json/");
        let geo = reqwest::get(url)
            .await
            .ok()?
            .error_for_status()
            .ok()?
            .json::<GeoIpResponse>()
            .await
            .ok()?;

        if geo.error.unwrap_or(false) {
            return None;
        }

        format_location(&geo)
    };

    timeout(Duration::from_millis(1500), lookup)
        .await
        .ok()
        .flatten()
}

fn format_location(geo: &GeoIpResponse) -> Option<String> {
    let country = geo.country_name.as_ref().or(geo.country.as_ref());
    let mut parts: Vec<String> = Vec::new();

    for part in [geo.city.as_ref(), geo.region.as_ref(), country]
        .into_iter()
        .flatten()
    {
        let part = part.trim();
        if !part.is_empty()
            && !parts
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(part))
        {
            parts.push(part.to_string());
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(", "))
    }
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || ip.is_unspecified()
                || ip.is_multicast()
                || octets[0] == 0
                || (octets[0] == 100 && (64..=127).contains(&octets[1])))
        }
        IpAddr::V6(ip) => {
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || is_ipv6_unique_local(ip)
                || is_ipv6_link_local(ip)
                || is_ipv6_documentation(ip))
        }
    }
}

fn is_ipv6_unique_local(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

fn is_ipv6_link_local(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xffc0) == 0xfe80
}

fn is_ipv6_documentation(ip: Ipv6Addr) -> bool {
    ip.segments()[0] == 0x2001 && ip.segments()[1] == 0x0db8
}

/// POST /api/v1/auth/register
pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut req): Json<RegisterRequest>,
) -> ApiResult<AuthResponse> {
    req.email = req.email.trim().to_string();
    req.password = req.password.trim().to_string();
    req.username = req.username.map(|username| username.trim().to_string());
    req.name = req.name.map(|name| name.trim().to_string());

    if let Err(e) = req.validate() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_error_code(val_codes::INVALID_INPUT)
            .with_message(format!("Validation error: {e}")));
    }

    let device_info = device_info_from_headers(&headers).await;

    let mut register_data =
        crate::feature::auth::RegisterData::new(req.email.clone(), req.password.clone());

    if let Some(username) = req.username {
        register_data = register_data.with_username(username);
    }
    if let Some(name) = req.name {
        register_data = register_data.with_full_name(name);
    }
    register_data = register_data.with_device_info(device_info);

    let (response, refresh_cookie) =
        state
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
    let origin = frontend_origin(&headers, &state.config);

    tokio::spawn(async move {
        let token = uuid::Uuid::new_v4().to_string();
        let expires_at = chrono::Utc::now() + chrono::Duration::hours(24);

        let token_set = match state_clone
            .user_repo
            .set_verification_token(state_clone.db.pool(), user_id, &token, expires_at)
            .await
        {
            Ok(token_set) => token_set,
            Err(e) => {
                tracing::error!("Failed to set verification token: {}", e);
                return;
            }
        };

        if !token_set {
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

    if let Err(error) = state
        .notification_service
        .notify_user_registered(
            state.db.pool(),
            response.user.id,
            &response.user.email,
            response.user.username.as_deref(),
        )
        .await
    {
        tracing::warn!("Failed to create registration notification: {error}");
    } else {
        state.ws_manager.broadcast_notifications_updated();
    }

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
    headers: HeaderMap,
    Json(mut creds): Json<LoginCredentials>,
) -> ApiResult<AuthResponse> {
    creds.username = creds.username.trim().to_string();
    creds.password = creds.password.trim().to_string();

    // Check existing refresh token to avoid concurrent login issues
    if let Some(_cookie) = jar.get(REFRESH_TOKEN_COOKIE) {
        let _ = state.auth_service.logout(None, None).await;
    }

    let device_info = device_info_from_headers(&headers).await;

    let login_creds =
        crate::feature::auth::LoginCreds::new(creds.username.clone(), creds.password.clone())
            .with_device_info(device_info);

    let (response, refresh_cookie) =
        state
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_ip_uses_first_forwarded_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "8.8.8.8, 10.0.0.12".parse().unwrap());

        assert_eq!(client_ip_from_headers(&headers), "8.8.8.8");
    }

    #[test]
    fn client_ip_strips_ipv4_port() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", "8.8.4.4:51234".parse().unwrap());

        assert_eq!(client_ip_from_headers(&headers), "8.8.4.4");
    }

    #[test]
    fn forwarded_header_supports_quoted_ipv6() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "forwarded",
            "for=\"[2001:4860:4860::8888]:443\";proto=https"
                .parse()
                .unwrap(),
        );

        assert_eq!(client_ip_from_headers(&headers), "2001:4860:4860::8888");
    }

    #[test]
    fn public_ip_filter_skips_local_ranges() {
        assert!(!is_public_ip("127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("10.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("100.64.0.1".parse().unwrap()));
        assert!(!is_public_ip("::1".parse().unwrap()));
        assert!(!is_public_ip("fc00::1".parse().unwrap()));
        assert!(is_public_ip("8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn format_location_omits_duplicate_parts() {
        let geo = GeoIpResponse {
            city: Some("Singapore".to_string()),
            region: Some("Singapore".to_string()),
            country_name: Some("Singapore".to_string()),
            country: None,
            error: None,
        };

        assert_eq!(format_location(&geo).as_deref(), Some("Singapore"));
    }
}
