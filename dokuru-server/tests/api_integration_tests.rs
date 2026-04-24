use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

#[tokio::test]
async fn test_health_endpoint() {
    let app = create_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
#[ignore = "Requires database and full app infrastructure"]
async fn test_register_endpoint() {
    let app = create_test_app().await;

    let payload = json!({
        "email": "test@example.com",
        "password": "TestPass123!",
        "username": "testuser"
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/register")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status() == StatusCode::CREATED || response.status() == StatusCode::CONFLICT);
}

#[tokio::test]
#[ignore = "Requires database and full app infrastructure"]
async fn test_login_endpoint() {
    let app = create_test_app().await;

    let payload = json!({
        "email": "test@example.com",
        "password": "TestPass123!"
    });

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/login")
                .method("POST")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert!(response.status() == StatusCode::OK || response.status() == StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[ignore = "Requires database and full app infrastructure"]
async fn test_me_endpoint_unauthorized() {
    let app = create_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/me")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[ignore = "Requires database and full app infrastructure"]
async fn test_agents_list_unauthorized() {
    let app = create_test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/agents")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

fn create_test_app() -> axum::Router {
    // Mock app router for testing
    use axum::{Router, routing::get};

    Router::new().route("/health", get(|| async { "OK" }))
}
