use axum::{
    body::Body,
    http::{HeaderMap, Request, StatusCode, header},
};
use serde_json::Value;
use tower::ServiceExt;

pub async fn patch_authed(
    app: axum::Router,
    uri: &str,
    token: &str,
    body: &Value,
) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("PATCH")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_string(body).unwrap()))
        .unwrap();

    response_json(app.oneshot(req).await.unwrap()).await
}

pub async fn raw_request(app: axum::Router, req: Request<Body>) -> (StatusCode, HeaderMap, Value) {
    let response = app.oneshot(req).await.unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let body = json_body(response).await;
    (status, headers, body)
}

pub fn extract_set_cookie(headers: &HeaderMap, cookie_name: &str) -> Option<String> {
    headers
        .get_all(header::SET_COOKIE)
        .iter()
        .find_map(|value| {
            let cookie = value.to_str().ok()?;
            if cookie.starts_with(cookie_name) {
                Some(cookie.split(';').next()?.to_string())
            } else {
                None
            }
        })
}

pub async fn post_json_with_cookie(
    app: axum::Router,
    uri: &str,
    body: &Value,
    cookie: &str,
) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("POST")
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::COOKIE, cookie)
        .body(Body::from(serde_json::to_string(body).unwrap()))
        .unwrap();

    response_json(app.oneshot(req).await.unwrap()).await
}

async fn response_json(response: axum::http::Response<Body>) -> (StatusCode, Value) {
    let status = response.status();
    let body = json_body(response).await;
    (status, body)
}

async fn json_body(response: axum::http::Response<Body>) -> Value {
    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    serde_json::from_slice(&body_bytes).unwrap_or(Value::Null)
}
