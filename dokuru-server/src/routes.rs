use axum::{Extension, Router, middleware::from_fn};
use std::time::Duration;
use tower_http::services::ServeDir;

use crate::{
    feature::{admin, auth, health, user},
    infrastructure::web::middleware::{RateLimiter, rate_limit_middleware},
    state::AppState,
};

pub fn app_routes(state: AppState) -> Router {
    // Global: 120 req/min per IP
    let global_limiter = RateLimiter::new(120, Duration::from_secs(60));
    // Auth: 10 req/min per IP (anti brute-force)
    let auth_limiter = RateLimiter::new(10, Duration::from_secs(60));

    // Cleanup expired entries every minute
    let g = global_limiter.clone();
    let a = auth_limiter.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            g.cleanup();
            a.cleanup();
        }
    });

    // login & register: strict rate limit (anti brute-force)
    let auth_sensitive = auth::auth_sensitive_routes()
        .layer(from_fn(rate_limit_middleware))
        .layer(Extension(auth_limiter));

    // Provide session_blacklist to auth middleware
    let blacklist = state.session_blacklist.clone();
    let api_routes = Router::new()
        .nest("/auth", auth::auth_routes().merge(auth_sensitive))
        .nest("/users", user::user_routes())
        .nest("/admin", admin::routes::admin_routes())
        .nest("/admin/api-keys", admin::api_key::api_key_routes())
        .layer(Extension(blacklist)) // Inject blacklist for auth middleware
        .layer(from_fn(rate_limit_middleware))
        .layer(Extension(global_limiter));

    Router::new()
        .nest("/health", health::health_routes())
        .nest("/api/v1", api_routes)
        .nest_service("/media", ServeDir::new("uploads"))
        .fallback(handle_404)
        .with_state(state)
}

async fn handle_404() -> crate::infrastructure::web::response::ApiError {
    crate::infrastructure::web::response::ApiError::default()
        .with_code(axum::http::StatusCode::NOT_FOUND)
        .with_message("The requested endpoint does not exist")
}
