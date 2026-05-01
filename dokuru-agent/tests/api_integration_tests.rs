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

// Web assets routing tests
mod web_assets_routing {
    #[test]
    fn test_api_paths_protected() {
        // These paths should be protected from SPA fallback
        let protected_paths = vec![
            "/health",
            "/health/detail",
            "/ws",
            "/api/v1/containers",
            "/audit",
            "/audit/123",
            "/audit/history/abc-123",
            "/docker/containers",
            "/fix/history",
            "/rules/1.1",
            "/trivy/scan",
            "/host/shell",
            "/proxy/request",
            "/environments/list",
        ];

        for path in protected_paths {
            assert!(
                is_api_path_protected(path),
                "Path {} should be protected as API path",
                path
            );
        }
    }

    #[test]
    fn test_static_paths_allowed() {
        // These paths should be served as static files or SPA fallback
        let static_paths = vec![
            "/",
            "/index.html",
            "/assets/main.js",
            "/agents",
            "/agents/123",
            "/settings",
            "/login",
        ];

        for path in static_paths {
            assert!(
                !is_api_path_protected(path),
                "Path {} should NOT be protected (should serve static/SPA)",
                path
            );
        }
    }

    // Helper function that replicates is_api_path logic
    fn is_api_path_protected(path: &str) -> bool {
        matches!(path, "/health" | "/health/detail" | "/ws")
            || path.starts_with("/api/")
            || path.starts_with("/audit")
            || path.starts_with("/docker/")
            || path.starts_with("/fix")
            || path.starts_with("/rules")
            || path.starts_with("/trivy")
            || path.starts_with("/host/")
            || path.starts_with("/proxy/")
            || path.starts_with("/environments/")
    }
}

// Audit path validation tests
mod audit_storage {
    #[test]
    fn test_audit_id_validation_valid() {
        // Valid audit IDs
        let valid_ids = vec![
            "550e8400-e29b-41d4-a716-446655440000", // UUID
            "abc123",                                // alphanumeric
            "AUDIT123",                              // uppercase
            "audit-123-xyz",                         // with hyphens
        ];

        for id in valid_ids {
            assert!(
                is_valid_audit_id(id),
                "Audit ID '{}' should be valid",
                id
            );
        }
    }

    #[test]
    fn test_audit_id_validation_invalid() {
        // Invalid audit IDs - path traversal and injection attempts
        let invalid_ids = vec![
            "",                    // empty
            "audit/123",          // path traversal
            "audit\\123",         // backslash
            "audit;drop",         // SQL injection attempt
            "audit*123",          // wildcard
            "audit@host",         // special char
            "audit..etc",         // directory traversal
            "audit 123",          // space
            "../etc/passwd",      // directory traversal
            "../../secret",       // directory traversal
        ];

        for id in invalid_ids {
            assert!(
                !is_valid_audit_id(id),
                "Audit ID '{}' should be invalid (security risk)",
                id
            );
        }
    }

    // Helper function that replicates audit_path validation logic
    fn is_valid_audit_id(audit_id: &str) -> bool {
        !audit_id.is_empty()
            && audit_id
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    }
}
