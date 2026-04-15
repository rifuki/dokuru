use crate::api::state::AppState;
use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};

/// Generic reverse proxy: forwards any request to the target environment's agent
/// and streams the response back to the caller.
///
/// Route pattern: /api/v1/remote/{env_id}/{*path}
pub async fn proxy_to_environment(
    Path((env_id, tail)): Path<(String, String)>,
    State(state): State<AppState>,
    req: Request,
) -> Response {
    // Look up the environment
    let envs = state.environments.read().await;
    let env = match envs.iter().find(|e| e.id == env_id) {
        Some(e) => e.clone(),
        None => {
            drop(envs);
            return (
                StatusCode::NOT_FOUND,
                format!("Environment '{}' not found", env_id),
            )
                .into_response();
        }
    };
    drop(envs);

    // Build target URL
    let target_url = format!("{}/{}", env.url.trim_end_matches('/'), tail);

    // Read body bytes
    let method = req.method().clone();
    let original_headers = req.headers().clone();
    let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
        Ok(b) => b,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, "Failed to read request body").into_response();
        }
    };

    // Build reqwest request
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap();

    let mut rq = client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
        &target_url,
    );

    // Forward Content-Type if present
    if let Some(ct) = original_headers.get(header::CONTENT_TYPE)
        && let Ok(ct_str) = ct.to_str()
    {
        rq = rq.header(reqwest::header::CONTENT_TYPE, ct_str);
    }

    if !body_bytes.is_empty() {
        rq = rq.body(body_bytes.to_vec());
    }

    // Execute
    match rq.send().await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16())
                .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

            let mut headers = HeaderMap::new();
            for (name, value) in resp.headers() {
                if let (Ok(n), Ok(v)) = (
                    HeaderName::try_from(name.as_str()),
                    HeaderValue::from_bytes(value.as_bytes()),
                ) {
                    headers.insert(n, v);
                }
            }

            // Always add CORS header for browser clients
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_ORIGIN,
                HeaderValue::from_static("*"),
            );

            let body_bytes = resp.bytes().await.unwrap_or_default();
            let body = Body::from(body_bytes);

            (status, headers, body).into_response()
        }
        Err(e) => {
            let msg = if e.is_timeout() {
                format!("Remote agent at '{}' timed out", env.url)
            } else if e.is_connect() {
                format!("Cannot connect to remote agent at '{}': {}", env.url, e)
            } else {
                format!("Proxy error: {}", e)
            };
            (StatusCode::BAD_GATEWAY, msg).into_response()
        }
    }
}
