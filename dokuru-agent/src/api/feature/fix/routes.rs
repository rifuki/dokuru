use super::handlers;
use crate::api::state::AppState;
use axum::{
    Router,
    routing::{get, post},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/fix", post(handlers::apply_fix))
        .route("/audit/fix", post(handlers::apply_fix))
        .route("/fix/preview", get(handlers::preview_fix))
        .route("/audit/fix/preview", get(handlers::preview_fix))
        .route("/fix/verify", post(handlers::verify_fix))
        .route("/audit/fix/verify", post(handlers::verify_fix))
        .route("/fix/stream", get(handlers::stream_fix))
        .route("/audit/fix/stream", get(handlers::stream_fix))
        .route("/fix/history", get(handlers::list_history))
        .route("/audit/fix/history", get(handlers::list_history))
        .route("/fix/rollback", post(handlers::rollback_fix))
        .route("/audit/fix/rollback", post(handlers::rollback_fix))
}
