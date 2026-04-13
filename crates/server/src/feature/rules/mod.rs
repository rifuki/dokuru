use crate::infrastructure::web::response::{ApiResult, ApiSuccess};
use dokuru_core::CisRule;

pub async fn list_rules() -> ApiResult<Vec<CisRule>> {
    Ok(ApiSuccess::default().with_data(dokuru_core::get_all_rules()))
}
