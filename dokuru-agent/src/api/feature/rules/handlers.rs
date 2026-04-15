use crate::api::infrastructure::web::response::{ApiResult, ApiSuccess};
use crate::audit::RuleRegistry;

pub async fn list_rules() -> ApiResult<Vec<serde_json::Value>> {
    let registry = RuleRegistry::new();
    let rules: Vec<_> = registry
        .all()
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "title": r.title,
                "section": r.section,
                "severity": r.severity,
                "category": r.category,
                "description": r.description,
            })
        })
        .collect();
    Ok(ApiSuccess::default().with_data(rules))
}
