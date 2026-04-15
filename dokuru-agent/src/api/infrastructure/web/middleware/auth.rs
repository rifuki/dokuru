use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::api::state::AppState;

/// Agent token authentication middleware.
/// Validates Bearer token against stored hash using constant-time comparison.
pub async fn agent_auth_middleware(
    State(state): State<AppState>,
    request: Request,
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

    // Hash the provided token
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let token_hash = hex::encode(hasher.finalize());

    // Constant-time comparison
    let stored_hash = state.config.auth.token_hash.as_bytes();
    let provided_hash = token_hash.as_bytes();

    if stored_hash.ct_eq(provided_hash).into() {
        Ok(next.run(request).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}
