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
    matches!(
        path,
        "/health" | "/health/detail" | "/ws" | "/audit" | "/audit/ws"
    ) || path.starts_with("/api/")
        || path.starts_with("/docker/")
        || path.starts_with("/fix")
        || path.starts_with("/rules")
        || path.starts_with("/trivy")
        || path.starts_with("/host/")
}

fn cache_control_for(path: &str) -> &'static str {
    if path.starts_with("/assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    }
}
