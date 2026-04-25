use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    feature::{
        auth::{AuthUser, Role},
        notification::{
            catalog::NotificationKind,
            dto::{
                ListNotificationsQuery, MarkAllReadResponse, NotificationPreferenceResponse,
                NotificationSummaryResponse, ResetNotificationPreferencesResponse,
                UnreadCountResponse, UpdateNotificationPreferenceRequest,
            },
        },
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

pub async fn notification_summary(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<NotificationSummaryResponse> {
    let summary = state
        .notification_service
        .summary_for_user(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(summary))
}

pub async fn list_notification_preferences(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<Vec<NotificationPreferenceResponse>> {
    let preferences = state
        .notification_service
        .list_preferences(state.db.pool(), auth_user.user_id, &auth_user.roles)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(preferences))
}

pub async fn update_notification_preference(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(kind): Path<String>,
    Json(payload): Json<UpdateNotificationPreferenceRequest>,
) -> ApiResult<NotificationPreferenceResponse> {
    let Some(kind) = NotificationKind::from_str(&kind) else {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Unknown notification kind"));
    };

    if kind.is_admin() && !auth_user.roles.contains(&Role::Admin) {
        return Err(ApiError::default()
            .with_code(StatusCode::FORBIDDEN)
            .with_message("Admin notification preferences require an admin account"));
    }

    if !kind.is_configurable() {
        return Err(ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("This notification preference cannot be changed"));
    }

    let preference = state
        .notification_service
        .set_preference(
            state.db.pool(),
            auth_user.user_id,
            &auth_user.roles,
            kind,
            payload.enabled,
        )
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(preference))
}

pub async fn reset_notification_preferences(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> ApiResult<ResetNotificationPreferencesResponse> {
    let deleted = state
        .notification_service
        .reset_preferences(state.db.pool(), auth_user.user_id)
        .await
        .map_err(|e| ApiError::default().with_message(e.to_string()))?;

    Ok(ApiSuccess::default().with_data(ResetNotificationPreferencesResponse { deleted }))
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
