use super::feature::{audit, containers, environments, fix, health, info, proxy, rules, trivy};
use super::state::AppState;
use axum::Router;

pub fn build_router(state: AppState) -> Router {
    Router::new()
        // Feature routes
        .merge(health::routes())
        .merge(audit::routes())
        .merge(fix::routes())
        .merge(rules::routes())
        // TODO: Refactor remaining features to use routes() pattern
        .nest("/api/v1", api_v1_routes())
        .with_state(state)
}

fn api_v1_routes() -> Router<AppState> {
    Router::new()
        .route("/info", axum::routing::get(info::get_info))
        .route(
            "/containers",
            axum::routing::get(containers::list_containers),
        )
        .route(
            "/integrations/trivy/image",
            axum::routing::post(trivy::scan_image),
        )
        // Multi-environment management
        .route(
            "/environments",
            axum::routing::get(environments::list_environments).post(environments::add_environment),
        )
        .route(
            "/environments/{id}",
            axum::routing::delete(environments::remove_environment),
        )
        // Proxy to remote environments
        .route(
            "/remote/{env_id}/{*tail}",
            axum::routing::any(proxy::proxy_to_environment),
        )
}
