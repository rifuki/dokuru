use axum::{routing::get, Router};

use crate::state::AppState;

use super::handler::ws_agent_handler;

pub fn ws_routes() -> Router<AppState> {
    Router::new().route("/agent", get(ws_agent_handler))
}
