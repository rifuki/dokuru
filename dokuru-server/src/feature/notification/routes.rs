use axum::{
    Router, middleware,
    routing::{get, post},
};

use crate::{infrastructure::web::middleware::auth_middleware, state::AppState};

use super::handlers;

pub fn notification_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list_notifications))
        .route("/unread-count", get(handlers::unread_count))
        .route("/{id}/read", post(handlers::mark_notification_read))
        .route("/read-all", post(handlers::mark_all_notifications_read))
        .layer(middleware::from_fn(auth_middleware))
}
