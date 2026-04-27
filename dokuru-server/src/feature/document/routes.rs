use crate::{
    feature::document::{domain::MAX_DOCUMENT_SIZE_BYTES, handlers},
    infrastructure::web::middleware::{admin_middleware, auth_middleware},
    state::AppState,
};
use axum::{
    Router,
    extract::DefaultBodyLimit,
    middleware,
    routing::{delete, get, post},
};

pub fn document_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::get_current_document))
        .route("/", post(handlers::upload_document))
        .route("/file", get(handlers::serve_document_file))
        .route("/{id}", delete(handlers::delete_document))
        .layer(DefaultBodyLimit::max(MAX_DOCUMENT_SIZE_BYTES))
        .route_layer(middleware::from_fn(admin_middleware))
        .route_layer(middleware::from_fn(auth_middleware))
}

pub fn document_user_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::get_current_document))
        .route("/file", get(handlers::serve_document_file))
        .route_layer(middleware::from_fn(auth_middleware))
}
