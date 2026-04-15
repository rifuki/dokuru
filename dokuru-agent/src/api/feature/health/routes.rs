use axum::{Router, routing::get};

use crate::{AppState, feature::health::handlers};

pub fn health_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::health_check))
        .route("/detail", get(handlers::health_check_detailed))
}
