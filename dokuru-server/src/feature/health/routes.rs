use axum::{Router, routing::get};

use crate::state::AppState;

use super::handler::{health_check, health_check_detailed};

pub fn health_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(health_check))
        .route("/detailed", get(health_check_detailed))
}
