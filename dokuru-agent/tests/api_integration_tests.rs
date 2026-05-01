use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
    routing::get,
};
use tower::ServiceExt;

#[tokio::test]
async fn test_health_endpoint() {
    let app = create_test_app();

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
async fn test_not_found_endpoint() {
    let app = create_test_app();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/nonexistent")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

fn create_test_app() -> Router {
    Router::new().route("/health", get(|| async { "OK" }))
}

#[test]
fn test_embedded_www_dist_exists() {
    // Verify that dokuru-www/dist was built and contains index.html
    let www_dist = std::path::Path::new("../dokuru-www/dist/index.html");
    assert!(
        www_dist.exists(),
        "dokuru-www/dist/index.html must exist. Run 'cargo build' to auto-generate it."
    );
}

#[test]
fn test_www_dist_has_assets() {
    // Verify that dist contains built assets (js, css)
    let www_dist = std::path::Path::new("../dokuru-www/dist");
    let assets_dir = www_dist.join("assets");

    assert!(
        assets_dir.exists(),
        "dokuru-www/dist/assets directory must exist"
    );

    // Count files in assets directory
    let file_count = std::fs::read_dir(&assets_dir)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .count()
        })
        .unwrap_or(0);

    assert!(
        file_count > 0,
        "dokuru-www/dist/assets must contain at least one built file"
    );
}
