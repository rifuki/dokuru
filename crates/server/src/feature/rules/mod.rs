use axum::Json;
use dokuru_core::CisRule;

pub async fn list_rules() -> Json<Vec<CisRule>> {
    Json(dokuru_core::get_all_rules())
}
