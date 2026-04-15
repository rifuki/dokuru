use super::feature::{audit, containers, environments, fix, health, info, proxy, rules, trivy};
use super::state::AppState;
use axum::Router;

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .merge(health::routes())
        .merge(audit::routes())
        .merge(fix::routes())
        .merge(rules::routes())
        .merge(info::routes())
        .merge(containers::routes())
        .merge(trivy::routes())
        .merge(environments::routes())
        .merge(proxy::routes())
        .with_state(state)
}
