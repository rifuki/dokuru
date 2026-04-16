use axum::{Extension, extract::Request, http::StatusCode, middleware::Next, response::Response};
use std::sync::Arc;

use crate::{
    feature::auth::{AuthUser, types::Role, utils::validate_access_token},
    infrastructure::persistence::redis_trait::SessionBlacklist,
};

/// Require valid JWT. Injects `AuthUser` into request extensions.
/// Returns 401 if token is missing, invalid, or blacklisted.
pub async fn auth_middleware(
    Extension(blacklist): Extension<Option<Arc<dyn SessionBlacklist>>>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let claims = validate_access_token(token).map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Check if session is blacklisted (if Redis is configured)
    if let Some(ref blacklist) = blacklist {
        let is_blacklisted = blacklist
            .is_blacklisted(&claims.jti)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        if is_blacklisted {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    let user_id = uuid::Uuid::parse_str(&claims.sub).map_err(|_| StatusCode::UNAUTHORIZED)?;

    request.extensions_mut().insert(AuthUser {
        user_id,
        email: String::new(), // not stored in claims; fetch from DB if needed
        roles: claims.roles,
        session_id: claims.sid,
    });

    Ok(next.run(request).await)
}

/// Optional JWT extraction — does not reject unauthenticated requests.
/// Injects `AuthUser` only when a valid token is present.
pub async fn optional_auth_middleware(
    Extension(blacklist): Extension<Option<Arc<dyn SessionBlacklist>>>,
    mut request: Request,
    next: Next,
) -> Response {
    if let Some(token) = request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        && let Ok(claims) = validate_access_token(token)
    {
        // Check blacklist if available
        let is_blacklisted = if let Some(ref blacklist) = blacklist {
            blacklist.is_blacklisted(&claims.jti).await.unwrap_or(false)
        } else {
            false
        };

        if !is_blacklisted && let Ok(user_id) = uuid::Uuid::parse_str(&claims.sub) {
            request.extensions_mut().insert(AuthUser {
                user_id,
                email: String::new(),
                roles: claims.roles,
                session_id: claims.sid,
            });
        }
    }

    next.run(request).await
}

/// Require `Role::Admin`. Must run AFTER `auth_middleware`.
/// Returns 401 if no AuthUser, 403 if not admin.
pub async fn admin_middleware(request: Request, next: Next) -> Result<Response, StatusCode> {
    let auth_user = request
        .extensions()
        .get::<AuthUser>()
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if !auth_user.roles.contains(&Role::Admin) {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(request).await)
}
