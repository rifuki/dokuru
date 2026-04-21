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
/// Also accepts `?token=` query parameter for WebSocket connections (browsers
/// cannot set the `Authorization` header during WebSocket upgrades).
pub async fn agent_auth_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Primary: Authorization: Bearer <token> header
    let token_from_header = request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_owned);

    // Fallback: ?token=<token> query parameter (for WebSocket upgrades)
    let token = if let Some(t) = token_from_header {
        t
    } else {
        let query = request.uri().query().unwrap_or("");
        query
            .split('&')
            .find_map(|part| {
                let mut kv = part.splitn(2, '=');
                if kv.next() == Some("token") {
                    kv.next().map(str::to_owned)
                } else {
                    None
                }
            })
            .ok_or(StatusCode::UNAUTHORIZED)?
    };
    let token = token.as_str();

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
