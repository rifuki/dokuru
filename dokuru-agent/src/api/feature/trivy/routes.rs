use super::handlers;
use crate::api::state::AppState;
use axum::{Router, routing::post};

pub fn routes() -> Router<AppState> {
    Router::new().route(
        "/api/v1/integrations/trivy/image",
        post(handlers::scan_image),
    )
}
