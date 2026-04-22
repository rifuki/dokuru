use axum::{routing::{get, post, delete}, Router};
use std::sync::Arc;
use crate::feature::document::{handlers, repository::DocumentRepository};

pub fn document_routes(repo: Arc<DocumentRepository>) -> Router {
    Router::new()
        .route("/", get(handlers::get_current_document))
        .route("/", post(handlers::upload_document))
        .route("/:id", delete(handlers::delete_document))
        .with_state(repo)
}
