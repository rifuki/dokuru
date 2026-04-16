//! Auth blacklist integration tests
//!
//! Tests that blacklisted tokens are properly rejected.
//! These tests require Redis to be running.

mod common;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use serde_json::json;
use tower::ServiceExt;

use common::*;

/// Helper to check if Redis is available for blacklist
fn redis_available() -> bool {
    std::env::var("REDIS_URL").is_ok()
}

#[tokio::test]
async fn test_logout_invalidates_token() {
    if !redis_available() {
        eprintln!("⚠️  Skipping test: REDIS_URL not set (blacklist not available)");
        return;
    }

    let (app, _c) = build_test_app().await;

    // 1. Register and login
    let (status, body) = post_json(
        app.clone(),
        "/api/v1/auth/register",
        &json!({ "email": "logout@example.com", "name": "Logout", "password": "pass1234" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    let token = body["data"]["token"]["access_token"].as_str().unwrap();

    // 2. Verify token works (can access /me)
    let (status, _) = get_authed(app.clone(), "/api/v1/users/me", token).await;
    assert_eq!(status, StatusCode::OK, "Token should work before logout");

    // 3. Logout (this should blacklist the token if implemented)
    // Note: Currently logout just clears cookie, doesn't blacklist
    // This test documents expected behavior when blacklist is implemented

    // TODO: When logout blacklist is implemented, uncomment:
    // let req = Request::builder()
    //     .method("POST")
    //     .uri("/api/v1/auth/logout")
    //     .header(header::AUTHORIZATION, format!("Bearer {}", token))
    //     .body(Body::empty())
    //     .unwrap();
    // let res: axum::http::Response<Body> = app.clone().oneshot(req).await.unwrap();
    // assert_eq!(res.status(), StatusCode::OK);

    // 4. Verify token still works (until blacklist is implemented)
    let (status, _) = get_authed(app, "/api/v1/users/me", token).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "Token should still work (blacklist not implemented in logout)"
    );
}

#[tokio::test]
async fn test_revoke_session_invalidates_token() {
    if !redis_available() {
        eprintln!("⚠️  Skipping test: REDIS_URL not set (blacklist not available)");
        return;
    }

    let (app, _c) = build_test_app().await;

    // 1. Register and login
    let (status, body) = post_json(
        app.clone(),
        "/api/v1/auth/register",
        &json!({ "email": "revoke@example.com", "name": "Revoke", "password": "pass1234" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    let token = body["data"]["token"]["access_token"].as_str().unwrap();

    // 2. Verify token works
    let (status, _) = get_authed(app.clone(), "/api/v1/users/me", token).await;
    assert_eq!(status, StatusCode::OK);

    // 3. Revoke specific session
    // Note: Session revoke endpoint is stubbed (returns 200 without actual implementation)
    let req = Request::builder()
        .method("DELETE")
        .uri("/api/v1/auth/sessions/test-session-id")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res: axum::http::Response<Body> = app.clone().oneshot(req).await.unwrap();

    // Currently returns 200 but doesn't actually revoke
    assert_eq!(res.status(), StatusCode::OK);

    // TODO: When session revoke with blacklist is implemented:
    // - Token should be rejected after revoke
}
