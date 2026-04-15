use super::feature::{audit, containers, environments, fix, health, info, proxy, rules, trivy};
use super::infrastructure::web::middleware::agent_auth_middleware;
use super::state::AppState;
use axum::{Router, middleware, routing::get};

pub fn build_router(state: AppState) -> Router {
    // Public routes (no auth)
    let public_routes = Router::new().route("/health", get(health::health_check));

    // Protected routes (require auth)
    let protected_routes = Router::new()
        .merge(health::routes())
        .merge(audit::routes())
        .merge(fix::routes())
        .merge(rules::routes())
        .merge(info::routes())
        .merge(containers::routes())
        .merge(trivy::routes())
        .merge(environments::routes())
        .merge(proxy::routes())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            agent_auth_middleware,
        ));

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .with_state(state)
}
