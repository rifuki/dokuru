use super::handlers;
use crate::api::state::AppState;
use axum::{Router, routing::get};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/audit", get(handlers::run_full_audit))
        .route("/audit/:rule_id", get(handlers::run_single_audit))
        .route("/audit/ws", get(handlers::ws_audit_handler))
}
