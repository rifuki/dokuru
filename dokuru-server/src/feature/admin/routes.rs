use axum::{
    Router, middleware,
    routing::{get, post},
};

use crate::{
    infrastructure::web::middleware::{admin_middleware, auth_middleware},
    state::AppState,
};

use super::{log, stats, user};

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/log/level", post(log::handler::set_log_level))
        .route("/users", get(user::handler::list_users))
        .route("/users/{id}/role", post(user::handler::update_user_role))
        .route("/stats", get(stats::handler::get_dashboard_stats))
        .route_layer(middleware::from_fn(admin_middleware))
        .route_layer(middleware::from_fn(auth_middleware))
}
