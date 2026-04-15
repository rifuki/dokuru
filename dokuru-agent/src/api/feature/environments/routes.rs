use super::handlers;
use crate::api::state::AppState;
use axum::{Router, routing::get};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/v1/environments",
            get(handlers::list_environments).post(handlers::add_environment),
        )
        .route(
            "/api/v1/environments/{id}",
            axum::routing::delete(handlers::remove_environment),
        )
}
