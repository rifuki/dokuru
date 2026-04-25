use crate::api::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::api::state::AppState;
use crate::audit::{FixOutcome, FixRequest, RuleRegistry};
use axum::{Json, extract::State};

pub async fn apply_fix(
    State(state): State<AppState>,
    Json(payload): Json<FixRequest>,
) -> ApiResult<FixOutcome> {
    let registry = RuleRegistry::new();

    match registry.fix_request(&payload, &state.docker).await {
        Ok(outcome) => Ok(ApiSuccess::default()
            .with_message("Remediation handled")
            .with_data(outcome)),
        Err(e) => Err(ApiError::default()
            .with_message("Failed to process remediation request")
            .with_debug(&e.to_string())),
    }
}
