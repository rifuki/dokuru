use axum::{
    Router, middleware,
    routing::{delete, get, patch, post},
};

use crate::{infrastructure::web::middleware::auth_middleware, state::AppState};

use super::{avatar, email_change, handler};

pub fn user_routes() -> Router<AppState> {
    Router::new()
        .route("/me", get(handler::get_me))
        .route("/me", patch(handler::update_me))
        .route("/avatar", post(avatar::upload_avatar))
        .route("/avatar", delete(avatar::delete_avatar))
        .route("/change-email", post(email_change::request_email_change))
        .route("/verify-email-change", get(email_change::verify_email_change))
        .layer(middleware::from_fn(auth_middleware))
}
