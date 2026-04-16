use axum::{
    Router, middleware,
    routing::{get, post},
};

use crate::{
    feature::audit_result::handlers as audit_handlers,
    infrastructure::web::middleware::auth_middleware,
    state::AppState,
};

use super::handlers;

pub fn agent_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list_agents).post(handlers::create_agent))
        .route(
            "/{id}",
            get(handlers::get_agent).delete(handlers::delete_agent),
        )
        .route("/{id}/audit", post(audit_handlers::save_audit))
        .route("/{id}/audits", get(audit_handlers::list_audits))
        .route("/{id}/audit/latest", get(audit_handlers::get_latest_audit))
        .layer(middleware::from_fn(auth_middleware))
}
