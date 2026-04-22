use crate::{feature::document::handlers, state::AppState};
use axum::{
    Router,
    routing::{delete, get, post},
};

pub fn document_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::get_current_document))
        .route("/", post(handlers::upload_document))
        .route("/{id}", delete(handlers::delete_document))
}
