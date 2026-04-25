use axum::{
    Extension,
    extract::{Path, Query, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    feature::{
        auth::AuthUser,
        notification::dto::{ListNotificationsQuery, MarkAllReadResponse, UnreadCountResponse},
    },
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

use super::dto::NotificationResponse;

pub async fn list_notifications(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Query(query): Query<ListNotificationsQuery>,
) -> ApiResult<Vec<NotificationResponse>> {
    let notifications = state
        .notification_service
        .list_for_user(state.db.pool(), auth_user.user_id, query)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(notifications))
}

pub async fn unread_count(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<UnreadCountResponse> {
    let count = state
        .notification_service
        .unread_count(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(UnreadCountResponse { count }))
}

pub async fn mark_notification_read(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> ApiResult<NotificationResponse> {
    let notification = state
        .notification_service
        .mark_read(state.db.pool(), auth_user.user_id, id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    notification.map_or_else(
        || {
            Err(ApiError::default()
                .with_code(StatusCode::NOT_FOUND)
                .with_message("Notification not found"))
        },
        |notification| Ok(ApiSuccess::default().with_data(notification)),
    )
}

pub async fn mark_all_notifications_read(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<MarkAllReadResponse> {
    let updated = state
        .notification_service
        .mark_all_read(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(MarkAllReadResponse { updated }))
}
