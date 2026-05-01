use axum::{
    extract::OriginalUri,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};

include!(concat!(env!("OUT_DIR"), "/embedded_www.rs"));

pub async fn serve(OriginalUri(uri): OriginalUri) -> Response {
    let path = uri.path();

    if is_api_path(path) {
        return StatusCode::NOT_FOUND.into_response();
    }

    let asset = embedded_www_asset(path).or_else(|| embedded_www_asset("/index.html"));
    match asset {
        Some((content_type, bytes)) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, content_type),
                (header::CACHE_CONTROL, cache_control_for(path)),
            ],
            bytes,
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

fn is_api_path(path: &str) -> bool {
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

fn cache_control_for(path: &str) -> &'static str {
    if path.starts_with("/assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_paths_excluded() {
        // Exact routes
        assert!(is_api_path("/health"));
        assert!(is_api_path("/health/detail"));
        assert!(is_api_path("/ws"));

        // /audit/* routes
        assert!(is_api_path("/audit"));
        assert!(is_api_path("/audit/ws"));
        assert!(is_api_path("/audit/123"));
        assert!(is_api_path("/audit/history/abc-123"));
        assert!(is_api_path("/audit/fix"));

        // /api/* routes
        assert!(is_api_path("/api/v1/containers"));
        assert!(is_api_path("/api/anything/here"));

        // /docker/* routes
        assert!(is_api_path("/docker/containers"));
        assert!(is_api_path("/docker/images/latest"));

        // /fix routes
        assert!(is_api_path("/fix"));
        assert!(is_api_path("/fix/history"));
        assert!(is_api_path("/fix/stream"));

        // /rules routes
        assert!(is_api_path("/rules"));
        assert!(is_api_path("/rules/anything"));

        // /trivy routes
        assert!(is_api_path("/trivy"));
        assert!(is_api_path("/trivy/scan"));

        // /host/* routes
        assert!(is_api_path("/host/shell"));
        assert!(is_api_path("/host/shell/stream"));

        // /proxy/* routes
        assert!(is_api_path("/proxy/something"));

        // /environments/* routes
        assert!(is_api_path("/environments/list"));
    }

    #[test]
    fn test_static_paths_allowed() {
        // Static assets
        assert!(!is_api_path("/assets/main.js"));
        assert!(!is_api_path("/assets/styles.css"));
        assert!(!is_api_path("/assets/fonts/roboto.woff2"));

        // Root and HTML
        assert!(!is_api_path("/"));
        assert!(!is_api_path("/index.html"));

        // SPA routes
        assert!(!is_api_path("/agents"));
        assert!(!is_api_path("/agents/123/containers"));
        assert!(!is_api_path("/settings"));
        assert!(!is_api_path("/login"));
    }

    #[test]
    fn test_cache_control() {
        assert_eq!(
            cache_control_for("/assets/main.js"),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(
            cache_control_for("/assets/logo.png"),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(cache_control_for("/index.html"), "no-cache");
        assert_eq!(cache_control_for("/"), "no-cache");
        assert_eq!(cache_control_for("/agents"), "no-cache");
    }
}
