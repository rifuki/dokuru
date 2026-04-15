use super::handlers;
use crate::api::state::AppState;
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new().route(
        "/api/v1/remote/{env_id}/{*tail}",
        axum::routing::any(handlers::proxy_to_environment),
    )
}
