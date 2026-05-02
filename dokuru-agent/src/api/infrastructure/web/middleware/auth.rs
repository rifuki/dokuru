use axum::{
    extract::{ConnectInfo, Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use subtle::ConstantTimeEq;

use crate::api::{AuthConfig, infrastructure::web::local_request, state::AppState};

/// Agent token authentication middleware.
/// Validates Bearer token against stored hash using constant-time comparison.
/// Also accepts `?token=` query parameter for WebSocket connections (browsers
/// cannot set the `Authorization` header during WebSocket upgrades).
pub async fn agent_auth_middleware(
    State(state): State<AppState>,
    ConnectInfo(client_addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if allows_tokenless_trusted_loopback(&state.config.auth, request.headers(), client_addr) {
        return Ok(next.run(request).await);
    }

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

fn allows_tokenless_trusted_loopback(
    auth: &AuthConfig,
    headers: &axum::http::HeaderMap,
    client_addr: SocketAddr,
) -> bool {
    let raw_token_missing = auth.token.as_deref().map(str::is_empty).unwrap_or(true);

    !auth.token_hash.is_empty()
        && raw_token_missing
        && local_request::is_trusted_loopback_request(headers, client_addr)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue, header};

    fn auth(token_hash: &str, token: Option<&str>) -> AuthConfig {
        AuthConfig {
            token_hash: token_hash.to_string(),
            token: token.map(str::to_string),
        }
    }

    fn addr(ip: &str) -> SocketAddr {
        format!("{ip}:51122").parse().expect("valid socket addr")
    }

    fn headers(host: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::HOST,
            HeaderValue::from_str(host).expect("valid host"),
        );
        headers
    }

    #[test]
    fn allows_trusted_loopback_when_raw_token_is_missing() {
        assert!(allows_tokenless_trusted_loopback(
            &auth("abc123", None),
            &headers("localhost:3939"),
            addr("127.0.0.1"),
        ));
    }

    #[test]
    fn still_requires_auth_when_raw_token_exists() {
        assert!(!allows_tokenless_trusted_loopback(
            &auth("abc123", Some("dok_token")),
            &headers("localhost:3939"),
            addr("127.0.0.1"),
        ));
    }

    #[test]
    fn rejects_public_tunnel_hosts() {
        assert!(!allows_tokenless_trusted_loopback(
            &auth("abc123", None),
            &headers("reviews-richards-charming-veteran.trycloudflare.com"),
            addr("127.0.0.1"),
        ));
    }
}
