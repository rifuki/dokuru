use axum::{extract::Request, middleware::Next, response::Response};
use uuid::Uuid;

pub const REQUEST_ID_HEADER: &str = "x-request-id";

/// Unique request ID, injected into request extensions
#[derive(Debug, Clone)]
pub struct RequestId(pub String);

/// Middleware: generate X-Request-Id per request, forward in response header
pub async fn request_id_middleware(mut req: Request, next: Next) -> Response {
    let id = req
        .headers()
        .get(REQUEST_ID_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    req.extensions_mut().insert(RequestId(id.clone()));

    let mut response = next.run(req).await;

    if let Ok(val) = id.parse() {
        response.headers_mut().insert(REQUEST_ID_HEADER, val);
    }

    response
}
