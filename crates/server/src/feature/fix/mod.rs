use axum::{Json, extract::State};
use dokuru_core::{FixOutcome, Fixer};
use serde::Deserialize;
use crate::infrastructure::web::response::{ApiResult, ApiSuccess, ApiError};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct FixRequest {
    pub rule_id: String,
}

pub async fn apply_fix(
    State(state): State<AppState>,
    Json(payload): Json<FixRequest>,
) -> ApiResult<FixOutcome> {
    let fixer = Fixer::new(state.docker.clone());
    
    match fixer.apply_fix(&payload.rule_id).await {
        Ok(outcome) => Ok(ApiSuccess::default()
            .with_message("Remediation handled")
            .with_data(outcome)),
        Err(e) => Err(ApiError::default().with_message("Failed to process remediation request").with_debug(e.to_string()))
    }
}
