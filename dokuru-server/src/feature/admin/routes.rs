use axum::{
    Router, middleware,
    routing::{delete, get, post},
};

use crate::{
    infrastructure::web::middleware::{admin_middleware, auth_middleware},
    state::AppState,
};

use super::{agent, audit, log, stats, system, user};

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/agents", get(agent::list_agents))
        .route("/audits", get(audit::list_audits))
        .route("/config", get(system::get_effective_config))
        .route("/logs", get(log::handler::get_logs))
        .route("/log/level", post(log::handler::set_log_level))
        .route("/users", get(user::handler::list_users))
        .route("/users/{id}", delete(user::handler::delete_user))
        .route("/users/{id}/role", post(user::handler::update_user_role))
        .route(
            "/users/{id}/status",
            post(user::handler::update_user_status),
        )
        .route(
            "/users/{id}/reset-password",
            post(user::handler::send_password_reset),
        )
        .route("/stats", get(stats::handler::get_dashboard_stats))
        .route_layer(middleware::from_fn(admin_middleware))
        .route_layer(middleware::from_fn(auth_middleware))
}
