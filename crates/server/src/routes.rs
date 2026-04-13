use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use rust_embed::RustEmbed;
use crate::state::AppState;
use crate::feature::{health, rules, containers, audit, fix};

#[derive(RustEmbed)]
#[folder = "../../web/dist"] // Assuming web/dist will be the output folder
struct WebAssets;

pub fn build_router(state: AppState) -> Router {
    Router::new()
        // REST API
        .route("/health/detail", get(health::health_detail)) // Note: the root "/api/v1" prefix can be added via nest
        .route("/api/v1/health/detail", get(health::health_detail))
        .route("/api/v1/rules", get(rules::list_rules))
        .route("/api/v1/containers", get(containers::list_containers))
        .route("/api/v1/audit", get(audit::run_full_audit))
        .route("/api/v1/audit/:id", get(audit::run_single_audit))
        .route("/api/v1/fix", post(fix::apply_fix))
        // WebSocket for live audit progress
        .route("/ws/audit", get(audit::ws_audit_handler))
        .with_state(state)
        .fallback(static_handler)
}

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();
    if path.is_empty() {
        path = "index.html".to_string();
    }

    match WebAssets::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .body(Body::from(content.data))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        None => {
            // For SPA routing, fallback to index.html if route not found
            if let Some(index) = WebAssets::get("index.html") {
                Response::builder()
                    .header(header::CONTENT_TYPE, "text/html")
                    .body(Body::from(index.data))
                    .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
            } else {
                StatusCode::NOT_FOUND.into_response()
            }
        }
    }
}
