use crate::infrastructure::web::response::{ApiError, ApiResult, ApiSuccess};
use crate::state::AppState;
use axum::extract::State;
use bollard::models::ContainerSummary;

pub async fn list_containers(State(state): State<AppState>) -> ApiResult<Vec<ContainerSummary>> {
    match state.docker.list_containers::<String>(None).await {
        Ok(containers) => Ok(ApiSuccess::default().with_data(containers)),
        Err(e) => Err(ApiError::default().with_message(e.to_string())),
    }
}
