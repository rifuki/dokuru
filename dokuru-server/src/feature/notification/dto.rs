use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    catalog::NotificationKind,
    entity::{Notification, NotificationSummaryRow},
};

#[derive(Debug, Deserialize)]
pub struct ListNotificationsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub unread_only: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct NotificationResponse {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
    pub message: String,
    pub target_path: Option<String>,
    pub metadata: serde_json::Value,
    pub read_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl From<Notification> for NotificationResponse {
    fn from(notification: Notification) -> Self {
        Self {
            id: notification.id,
            kind: notification.kind,
            title: notification.title,
            message: notification.message,
            target_path: notification.target_path,
            metadata: notification.metadata,
            read_at: notification.read_at,
            created_at: notification.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct UnreadCountResponse {
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct NotificationSummaryResponse {
    pub total: i64,
    pub unread: i64,
    pub kinds: Vec<NotificationKindSummaryResponse>,
}

#[derive(Debug, Serialize)]
pub struct NotificationKindSummaryResponse {
    pub kind: String,
    pub total: i64,
    pub unread: i64,
    pub latest_at: Option<DateTime<Utc>>,
    pub known: bool,
    pub audience: Option<&'static str>,
    pub severity: Option<&'static str>,
    pub target_hint: Option<&'static str>,
}

impl From<NotificationSummaryRow> for NotificationKindSummaryResponse {
    fn from(row: NotificationSummaryRow) -> Self {
        let kind = NotificationKind::from_str(&row.kind);

        Self {
            kind: row.kind,
            total: row.total,
            unread: row.unread,
            latest_at: row.latest_at,
            known: kind.is_some(),
            audience: kind.map(|kind| kind.audience().as_str()),
            severity: kind.map(|kind| kind.severity().as_str()),
            target_hint: kind.map(NotificationKind::target_hint),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MarkAllReadResponse {
    pub updated: u64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNotificationPreferenceRequest {
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct NotificationPreferenceResponse {
    pub kind: String,
    pub enabled: bool,
    pub configurable: bool,
    pub audience: &'static str,
    pub severity: &'static str,
    pub target_hint: &'static str,
}

impl NotificationPreferenceResponse {
    #[must_use]
    pub fn new(kind: NotificationKind, enabled: bool) -> Self {
        Self {
            kind: kind.as_str().to_owned(),
            enabled,
            configurable: kind.is_configurable(),
            audience: kind.audience().as_str(),
            severity: kind.severity().as_str(),
            target_hint: kind.target_hint(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ResetNotificationPreferencesResponse {
    pub deleted: u64,
}
