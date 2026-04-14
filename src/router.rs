use axum::{routing::get, Router};

use crate::handlers::{health::health, install::install, root::root};

pub fn router() -> Router {
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/install", get(install))
        .route("/install.sh", get(install))
}
