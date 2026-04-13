use chrono::Utc;
use serde_json::{Value as Json, json};

use crate::infrastructure::web::response::{ApiResult, ApiSuccess};

pub async fn health_check() -> ApiResult<()> {
    Ok(ApiSuccess::default().with_message("Service is healthy"))
}

pub async fn health_check_detailed() -> ApiResult<Json> {
    let health_data = json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": Utc::now().to_rfc3339()
    });

    Ok(ApiSuccess::default().with_data(health_data))
}
