use axum::{
    Router, middleware,
    routing::{get, post},
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
        .route("/{id}/fix", post(audit_handlers::run_relay_fix))
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
