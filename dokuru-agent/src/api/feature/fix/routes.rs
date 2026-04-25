use super::handlers;
use crate::api::state::AppState;
use axum::{Router, routing::post};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/fix", post(handlers::apply_fix))
        .route("/audit/fix", post(handlers::apply_fix))
}
