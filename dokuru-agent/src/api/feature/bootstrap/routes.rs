use axum::{Router, routing::get};

use super::handlers;
use crate::api::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/v1/bootstrap", get(handlers::get_bootstrap))
}
