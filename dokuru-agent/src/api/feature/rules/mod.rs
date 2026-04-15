use crate::api::infrastructure::web::response::{ApiResult, ApiSuccess};
use crate::audit::CisRule;

pub async fn list_rules() -> ApiResult<Vec<CisRule>> {
    Ok(ApiSuccess::default().with_data(crate::audit::get_all_rules()))
}
