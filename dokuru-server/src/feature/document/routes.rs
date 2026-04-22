use crate::{feature::document::handlers, state::AppState};
use axum::{
    Router,
    extract::DefaultBodyLimit,
    routing::{delete, get, post},
};

const DOCUMENT_SIZE_LIMIT: usize = 50 * 1024 * 1024; // 50 MB

pub fn document_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::get_current_document))
        .route("/", post(handlers::upload_document))
        .route("/file", get(handlers::serve_document_file))
        .route("/{id}", delete(handlers::delete_document))
        .layer(DefaultBodyLimit::max(DOCUMENT_SIZE_LIMIT))
}
