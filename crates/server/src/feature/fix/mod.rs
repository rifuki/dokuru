use axum::{Json, extract::State};
use dokuru_core::Fixer;
use serde::Deserialize;

use crate::state::AppState;

#[derive(Deserialize)]
pub struct FixRequest {
    pub rule_id: String,
}

pub async fn apply_fix(
    State(state): State<AppState>,
    Json(payload): Json<FixRequest>,
) -> Result<Json<serde_json::Value>, axum::http::StatusCode> {
    let fixer = Fixer::new(state.docker.clone());
    
    match fixer.apply_fix(&payload.rule_id).await {
        Ok(msg) => Ok(Json(serde_json::json!({
            "status": "success",
            "message": msg
        }))),
        Err(e) => Ok(Json(serde_json::json!({
            "status": "error",
            "message": e.to_string()
        })))
    }
}
