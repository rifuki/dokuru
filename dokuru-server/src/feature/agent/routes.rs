use axum::{
    Router, middleware,
    routing::{get, post},
};

use crate::{infrastructure::web::middleware::auth_middleware, state::AppState};

use super::handlers;

pub fn agent_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list_agents).post(handlers::create_agent))
        .route(
            "/{id}",
            get(handlers::get_agent).delete(handlers::delete_agent),
        )
        .layer(middleware::from_fn(auth_middleware))
}
