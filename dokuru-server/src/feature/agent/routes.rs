use axum::{
    Router, middleware,
    routing::{any, get, post},
};

use crate::{
    feature::audit_result::handlers as audit_handlers,
    infrastructure::web::middleware::auth_middleware, state::AppState,
};

use super::handlers;

pub fn agent_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list_agents).post(handlers::create_agent))
        .route(
            "/{id}",
            get(handlers::get_agent)
                .put(handlers::update_agent)
                .delete(handlers::delete_agent),
        )
        .route("/{id}/heartbeat", post(handlers::agent_heartbeat))
        .route(
            "/{id}/docker/events/stream",
            get(audit_handlers::relay_docker_events_ws),
        )
        .route(
            "/{id}/docker/containers/{container_id}/exec",
            get(audit_handlers::relay_docker_exec_ws),
        )
        .route(
            "/{id}/host/shell/stream",
            get(audit_handlers::relay_host_shell_ws),
        )
        .route(
            "/{id}/host/shell",
            get(audit_handlers::relay_host_shell_info),
        )
        .route(
            "/{id}/docker/{*tail}",
            any(audit_handlers::relay_docker_request),
        )
        .route("/{id}/health", get(audit_handlers::relay_health))
        .route("/{id}/fix", post(audit_handlers::run_relay_fix))
        .route("/{id}/fix/preview", get(audit_handlers::relay_fix_preview))
        .route("/{id}/fix/verify", post(audit_handlers::relay_fix_verify))
        .route("/{id}/fix/stream", get(audit_handlers::relay_fix_stream_ws))
        .route("/{id}/fix/history", get(audit_handlers::relay_fix_history))
        .route(
            "/{id}/fix/rollback",
            post(audit_handlers::relay_fix_rollback),
        )
        .route("/{id}/audit", post(audit_handlers::save_audit))
        .route("/{id}/audit/run", post(audit_handlers::run_relay_audit))
        .route("/{id}/audit/latest", get(audit_handlers::get_latest_audit))
        .route(
            "/{id}/audit/{audit_id}/report",
            get(audit_handlers::get_audit_report),
        )
        .route(
            "/{id}/audit/{audit_id}",
            get(audit_handlers::get_audit_by_id),
        )
        .route("/{id}/audits", get(audit_handlers::list_audits))
        .layer(middleware::from_fn(auth_middleware))
}
