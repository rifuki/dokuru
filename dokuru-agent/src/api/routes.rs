use super::feature::{
    audit, bootstrap, containers, environments, fix, health, host_shell, info, proxy, rules, trivy,
    web_assets, ws,
};
use super::infrastructure::web::middleware::agent_auth_middleware;
use super::state::AppState;
use crate::docker;
use axum::{Router, middleware};

pub fn build_router(state: AppState) -> Router {
    // Public routes (no auth) - health check and bootstrap
    let public_routes = Router::new()
        .merge(health::routes())
        .merge(bootstrap::routes::routes());

    // Protected routes (require auth token)
    let protected_routes = Router::new()
        .merge(info::routes())
        .merge(audit::routes())
        .merge(fix::routes())
        .merge(rules::routes())
        .merge(host_shell::routes::routes())
        .merge(containers::routes())
        .merge(trivy::routes())
        .merge(environments::routes())
        .merge(proxy::routes())
        .merge(docker::containers::routes())
        .merge(docker::images::routes())
        .merge(docker::networks::routes())
        .merge(docker::stacks::routes())
        .merge(docker::volumes::routes())
        .merge(docker::events::routes())
        .merge(ws::routes())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            agent_auth_middleware,
        ));

    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .fallback(web_assets::serve)
        .with_state(state)
}
