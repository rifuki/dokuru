pub mod fixtures;

pub use fixtures::{
    TestAgent, TestUser, generate_test_email, generate_test_password, generate_test_username,
};

use axum::{
    body::Body,
    http::{HeaderMap, Request, Response, StatusCode, header},
};
use serde_json::Value;
use tower::ServiceExt;

pub async fn build_test_app() -> (axum::Router, ()) {
    // Placeholder - implement actual test app setup
    (axum::Router::new(), ())
}

pub async fn post_json(app: axum::Router, uri: &str, body: &Value) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("POST")
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_string(body).unwrap()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let body_bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    let body_json = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
    (status, body_json)
}

pub async fn get_authed(app: axum::Router, uri: &str, token: &str) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("GET")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let body_bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    let body_json = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
    (status, body_json)
}

pub async fn patch_authed(
    app: axum::Router,
    uri: &str,
    token: &str,
    body: &Value,
) -> (StatusCode, Value) {
    let req = Request::builder()
        .method("PATCH")
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_string(body).unwrap()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let body_bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    let body_json = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
    (status, body_json)
}

pub async fn raw_request(app: axum::Router, req: Request<Body>) -> (StatusCode, HeaderMap, Value) {
    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let body_bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    let body_json = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
    (status, headers, body_json)
}

pub fn extract_set_cookie(headers: &HeaderMap, cookie_name: &str) -> Option<String> {
    headers.get_all(header::SET_COOKIE).iter().find_map(|v| {
        let s = v.to_str().ok()?;
        if s.starts_with(cookie_name) {
            Some(s.split(';').next()?.to_string())
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

    let res = app.oneshot(req).await.unwrap();
    let status = res.status();
    let body_bytes = axum::body::to_bytes(res.into_body(), usize::MAX)
        .await
        .unwrap();
    let body_json = serde_json::from_slice(&body_bytes).unwrap_or(Value::Null);
    (status, body_json)
}
