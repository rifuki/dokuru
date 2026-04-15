use super::handlers;
use crate::api::state::AppState;
use axum::{Router, routing::get};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(handlers::health_check))
        .route("/health/detail", get(handlers::health_detail))
        .route("/api/v1/health", get(handlers::health_check))
        .route("/api/v1/health/detail", get(handlers::health_detail))
}
