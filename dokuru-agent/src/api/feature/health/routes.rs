use super::handlers;
use crate::api::state::AppState;
use axum::{Router, routing::get};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(handlers::health_check))
        .route("/health/detail", get(handlers::health_detail))
}
