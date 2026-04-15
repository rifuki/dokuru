use super::handlers;
use crate::api::state::AppState;
use axum::{Router, routing::get};

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/v1/info", get(handlers::get_info))
}
