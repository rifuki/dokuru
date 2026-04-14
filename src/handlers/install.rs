use axum::http::StatusCode;
use std::convert::TryInto;
use worker::{Cache, Fetch, HttpResponse, Url};

const INSTALLER_URL: &str = "https://raw.githubusercontent.com/rifuki/dokuru/main/install.sh";
const CACHE_KEY: &str = "https://dokuru.rifuki.dev/__cache/install.sh";
const CACHE_CONTROL: &str = "public, max-age=300, s-maxage=1800";

#[worker::send]
pub async fn install() -> std::result::Result<HttpResponse, (StatusCode, &'static str)> {
    let cache = Cache::default();

    if let Some(cached) = cache
        .get(CACHE_KEY, false)
        .await
        .map_err(|_| (StatusCode::BAD_GATEWAY, "Failed to read installer cache"))?
    {
        return cached
            .try_into()
            .map_err(|_| (StatusCode::BAD_GATEWAY, "Failed to stream cached installer script"));
    }

    let url = Url::parse(INSTALLER_URL)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Invalid installer URL"))?;

    let mut response = Fetch::Url(url)
        .send()
        .await
        .map_err(|_| (StatusCode::BAD_GATEWAY, "Failed to fetch installer script"))?;

    if response.status_code() >= 400 {
        return Err((
            StatusCode::BAD_GATEWAY,
            "Installer source returned an upstream error",
        ));
    }

    let headers = response.headers_mut();
    headers
        .set("content-type", "text/x-shellscript; charset=utf-8")
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to set content type"))?;
    headers
        .set("cache-control", CACHE_CONTROL)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to set cache control"))?;
    headers
        .set("x-content-type-options", "nosniff")
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Failed to set response headers"))?;

    if let Ok(response_for_cache) = response.cloned() {
        let _ = cache.put(CACHE_KEY, response_for_cache).await;
    }

    response
        .try_into()
        .map_err(|_| (StatusCode::BAD_GATEWAY, "Failed to stream installer script"))
}
