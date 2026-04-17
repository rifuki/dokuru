use axum::{routing::get, Router};

use crate::handlers::{health::health, install::install};

pub fn router() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/install", get(install))
        .route("/install.sh", get(install))
}
