use axum::{
    Router, middleware,
    routing::{delete, get, post},
};

use crate::{infrastructure::web::middleware::auth_middleware, state::AppState};

use super::handlers::{create_token, list_tokens, revoke_token};

pub fn token_routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_token))
        .route("/", get(list_tokens))
        .route("/:id", delete(revoke_token))
        .layer(middleware::from_fn(auth_middleware))
}
