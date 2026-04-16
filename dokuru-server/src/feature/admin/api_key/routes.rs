use axum::{
    Router, middleware,
    routing::{delete, get, patch, post},
};

use crate::{
    infrastructure::web::middleware::{admin_middleware, auth_middleware},
    state::AppState,
};

use super::handler;

pub fn api_key_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handler::list_keys))
        .route("/", post(handler::create_key))
        .route("/{id}", get(handler::get_key))
        .route("/{id}", patch(handler::update_key))
        .route("/{id}", delete(handler::delete_key))
        .route("/{id}/revoke", post(handler::revoke_key))
        .route("/{id}/refresh", post(handler::refresh_key))
        .route_layer(middleware::from_fn(admin_middleware))
        .route_layer(middleware::from_fn(auth_middleware))
}
