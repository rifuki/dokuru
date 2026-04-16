use std::env;

use axum::{extract::Request, http::StatusCode, middleware::Next, response::Response};

const API_KEY_HEADER: &str = "x-api-key";

/// Middleware: validate X-Api-Key header against API_KEY env var
pub async fn api_key_middleware(req: Request, next: Next) -> Result<Response, StatusCode> {
    let expected = env::var("API_KEY").unwrap_or_default();

    if expected.is_empty() {
        // API_KEY not configured — deny all to prevent accidental open access
        tracing::warn!("API_KEY env var not set, denying request");
        return Err(StatusCode::UNAUTHORIZED);
    }

    let provided = req
        .headers()
        .get(API_KEY_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !constant_time_eq::constant_time_eq(expected.as_bytes(), provided.as_bytes()) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(next.run(req).await)
}
