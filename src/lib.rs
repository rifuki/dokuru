mod handlers;
mod router;

use tower_service::Service;
use worker::{event, Context, Env, HttpRequest, Result};

#[event(fetch)]
async fn fetch(
    req: HttpRequest,
    _env: Env,
    _ctx: Context,
) -> Result<axum::http::Response<axum::body::Body>> {
    Ok(router::router().call(req).await?)
}
