use axum::{
    Router, middleware,
    routing::{delete, get, post},
};

use crate::{
    feature::auth::handlers, infrastructure::web::middleware::auth_middleware, state::AppState,
};

/// Routes that need brute-force rate limiting (login, register)
pub fn auth_sensitive_routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(handlers::register))
        .route("/login", post(handlers::login))
}

/// Remaining auth routes — refresh + protected (global rate limit only)
pub fn auth_routes() -> Router<AppState> {
    let public = Router::new()
        .route("/refresh", post(handlers::refresh))
        .route(
            "/check-username",
            get(handlers::check_username_availability),
        )
        .route(
            "/check-email",
            get(handlers::check_email_availability),
        )
        .route("/verify-email", get(handlers::verify_email))
        .route("/resend-verification", post(handlers::resend_verification))
        .route("/forgot-password", post(handlers::forgot_password))
        .route("/reset-password", post(handlers::reset_password));

    let protected = Router::new()
        .route("/logout", post(handlers::logout))
        .route("/me", get(handlers::me))
        .route("/change-password", post(handlers::change_password))
        .route(
            "/sessions",
            get(handlers::list_sessions).delete(handlers::logout_all_sessions),
        )
        .route("/sessions/{id}", delete(handlers::revoke_session))
        .layer(middleware::from_fn(auth_middleware));

    public.merge(protected)
}
