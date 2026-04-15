use axum_extra::extract::cookie::Cookie;

use crate::infrastructure::config::Config;

pub const REFRESH_TOKEN_COOKIE: &str = "refresh_token";
pub const REFRESH_COOKIE_PATH: &str = "/api/v1/auth";

/// Build httpOnly refresh token cookie
/// 
/// Configuration (via environment variables):
/// - `COOKIE_SAMESITE`: "strict", "lax", or "none" (default: strict in prod, lax in dev)
/// - `COOKIE_SECURE`: "true" or "false" (default: true in prod, false in dev)
/// - `COOKIE_HTTPONLY`: "true" or "false" (default: true)
///
/// SECURITY NOTES:
/// - httpOnly: prevents XSS attacks from reading cookie
/// - secure: only sent over HTTPS (in production or when explicitly enabled)
/// - same_site: 
///   - Strict: same domain only (most secure)
///   - Lax: allows top-level navigation (good for cross-port dev)
///   - None: cross-domain with HTTPS (requires Secure=true)
/// - path: limited to auth endpoints only
pub fn create_refresh_cookie(token: &str, config: &Config) -> Cookie<'static> {
    let expiry_secs = std::env::var("JWT_REFRESH_EXPIRY_SECS")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(604_800); // default 7 days

    let cookie_config = &config.cookie;

    Cookie::build((REFRESH_TOKEN_COOKIE, token.to_string()))
        .http_only(cookie_config.http_only)
        .secure(cookie_config.secure)
        .same_site(cookie_config.same_site)
        .path(REFRESH_COOKIE_PATH)
        .max_age(time::Duration::seconds(expiry_secs))
        .build()
}

/// Create a cleared (expired) refresh token cookie for logout
pub fn create_cleared_cookie(config: &Config) -> Cookie<'static> {
    let cookie_config = &config.cookie;

    Cookie::build((REFRESH_TOKEN_COOKIE, ""))
        .http_only(cookie_config.http_only)
        .secure(cookie_config.secure)
        .same_site(cookie_config.same_site)
        .path(REFRESH_COOKIE_PATH)
        .max_age(time::Duration::seconds(0))
        .build()
}


