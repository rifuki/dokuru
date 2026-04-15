use axum::{
    middleware,
    routing::{delete, get},
    Router,
};

use crate::{infrastructure::web::middleware::auth_middleware, state::AppState};

use super::handlers::{delete_environment, get_environment, list_environments};

pub fn environment_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_environments))
        .route("/:id", get(get_environment))
        .route("/:id", delete(delete_environment))
        .layer(middleware::from_fn(auth_middleware))
}
