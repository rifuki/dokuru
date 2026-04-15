use axum::{
    middleware,
    routing::{get, post},
    Router,
};

use crate::{infrastructure::web::middleware::auth_middleware, state::AppState};

use super::handlers::{get_audit_detail, get_audit_history, trigger_audit};

pub fn audit_routes() -> Router<AppState> {
    Router::new()
        .route("/:env_id/run", post(trigger_audit))
        .route("/:env_id/history", get(get_audit_history))
        .route("/:env_id/results/:audit_id", get(get_audit_detail))
        .layer(middleware::from_fn(auth_middleware))
}
