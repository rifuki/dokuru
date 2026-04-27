use axum::{Router, routing::get};

use crate::api::state::AppState;

use super::handlers;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/host/shell", get(handlers::detect_shell))
        .route("/host/shell/stream", get(handlers::host_shell_ws))
}
