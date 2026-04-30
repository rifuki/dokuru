use async_trait::async_trait;
use eyre::Result;
use sqlx::PgPool;
use uuid::Uuid;

use super::entity::{Notification, NotificationPreference, NotificationSummaryRow};

pub struct CreateNotification<'a> {
    pub user_id: Uuid,
    pub kind: &'a str,
    pub title: &'a str,
    pub message: &'a str,
    pub target_path: Option<&'a str>,
    pub metadata: serde_json::Value,
}

#[async_trait]
pub trait NotificationRepository: Send + Sync {
    async fn create(&self, pool: &PgPool, input: CreateNotification<'_>) -> Result<Notification>;
    async fn create_for_admins(
        &self,
        pool: &PgPool,
        kind: &str,
        title: &str,
        message: &str,
        target_path: Option<&str>,
        metadata: serde_json::Value,
    ) -> Result<Vec<Notification>>;
    async fn list_for_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        limit: i64,
        offset: i64,
        unread_only: bool,
    ) -> Result<Vec<Notification>>;
    async fn unread_count(&self, pool: &PgPool, user_id: Uuid) -> Result<i64>;
    async fn summary_for_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<NotificationSummaryRow>>;
    async fn list_preferences(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<NotificationPreference>>;
    async fn set_preference(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        kind: &str,
        enabled: bool,
    ) -> Result<NotificationPreference>;
    async fn reset_preferences(&self, pool: &PgPool, user_id: Uuid) -> Result<u64>;
    async fn is_preference_enabled(&self, pool: &PgPool, user_id: Uuid, kind: &str)
    -> Result<bool>;
    async fn mark_read(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        notification_id: Uuid,
    ) -> Result<Option<Notification>>;
    async fn mark_all_read(&self, pool: &PgPool, user_id: Uuid) -> Result<u64>;
}

pub struct NotificationRepositoryImpl;

impl NotificationRepositoryImpl {
    #[must_use]
    pub const fn new() -> Self {
        Self
    }
}

impl Default for NotificationRepositoryImpl {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl NotificationRepository for NotificationRepositoryImpl {
    async fn create(&self, pool: &PgPool, input: CreateNotification<'_>) -> Result<Notification> {
        let notification = sqlx::query_as::<_, Notification>(
            r"
            INSERT INTO notifications (user_id, kind, title, message, target_path, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            ",
        )
        .bind(input.user_id)
        .bind(input.kind)
        .bind(input.title)
        .bind(input.message)
        .bind(input.target_path)
        .bind(input.metadata)
        .fetch_one(pool)
        .await?;

        Ok(notification)
    }

    async fn create_for_admins(
        &self,
        pool: &PgPool,
        kind: &str,
        title: &str,
        message: &str,
        target_path: Option<&str>,
        metadata: serde_json::Value,
    ) -> Result<Vec<Notification>> {
        let admin_ids = sqlx::query_scalar::<_, Uuid>(
            r"
            SELECT u.id
            FROM users u
            LEFT JOIN notification_preferences np
                ON np.user_id = u.id AND np.kind = $1
            WHERE u.role = 'admin'
                AND u.is_active = TRUE
                AND COALESCE(np.enabled, TRUE) = TRUE
            ",
        )
        .bind(kind)
        .fetch_all(pool)
        .await?;

        let mut notifications = Vec::with_capacity(admin_ids.len());
        for user_id in admin_ids {
            notifications.push(
                self.create(
                    pool,
                    CreateNotification {
                        user_id,
                        kind,
                        title,
                        message,
                        target_path,
                        metadata: metadata.clone(),
                    },
                )
                .await?,
            );
        }

        Ok(notifications)
    }

    async fn list_for_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        limit: i64,
        offset: i64,
        unread_only: bool,
    ) -> Result<Vec<Notification>> {
        let notifications = if unread_only {
            sqlx::query_as::<_, Notification>(
                r"
                SELECT *
                FROM notifications
                WHERE user_id = $1 AND read_at IS NULL
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                ",
            )
            .bind(user_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as::<_, Notification>(
                r"
                SELECT *
                FROM notifications
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2 OFFSET $3
                ",
            )
            .bind(user_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await?
        };

        Ok(notifications)
    }

    async fn unread_count(&self, pool: &PgPool, user_id: Uuid) -> Result<i64> {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL",
        )
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    async fn summary_for_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<NotificationSummaryRow>> {
        let rows = sqlx::query_as::<_, NotificationSummaryRow>(
            r"
            SELECT
                kind,
                COUNT(*)::BIGINT AS total,
                COUNT(*) FILTER (WHERE read_at IS NULL)::BIGINT AS unread,
                MAX(created_at) AS latest_at
            FROM notifications
            WHERE user_id = $1
            GROUP BY kind
            ORDER BY latest_at DESC NULLS LAST, kind ASC
            ",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(rows)
    }

    async fn list_preferences(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<NotificationPreference>> {
        let preferences = sqlx::query_as::<_, NotificationPreference>(
            r"
            SELECT user_id, kind, enabled, updated_at
            FROM notification_preferences
            WHERE user_id = $1
            ORDER BY kind ASC
            ",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(preferences)
    }

    async fn set_preference(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        kind: &str,
        enabled: bool,
    ) -> Result<NotificationPreference> {
        let preference = sqlx::query_as::<_, NotificationPreference>(
            r"
            INSERT INTO notification_preferences (user_id, kind, enabled)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, kind)
            DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
            RETURNING user_id, kind, enabled, updated_at
            ",
        )
        .bind(user_id)
        .bind(kind)
        .bind(enabled)
        .fetch_one(pool)
        .await?;

        Ok(preference)
    }

    async fn reset_preferences(&self, pool: &PgPool, user_id: Uuid) -> Result<u64> {
        let result = sqlx::query("DELETE FROM notification_preferences WHERE user_id = $1")
            .bind(user_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }

    async fn is_preference_enabled(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        kind: &str,
    ) -> Result<bool> {
        let enabled = sqlx::query_scalar::<_, bool>(
            r"
            SELECT COALESCE(
                (
                    SELECT enabled
                    FROM notification_preferences
                    WHERE user_id = $1 AND kind = $2
                ),
                TRUE
            )
            ",
        )
        .bind(user_id)
        .bind(kind)
        .fetch_one(pool)
        .await?;

        Ok(enabled)
    }

    async fn mark_read(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        notification_id: Uuid,
    ) -> Result<Option<Notification>> {
        let notification = sqlx::query_as::<_, Notification>(
            r"
            UPDATE notifications
            SET read_at = COALESCE(read_at, NOW())
            WHERE id = $1 AND user_id = $2
            RETURNING *
            ",
        )
        .bind(notification_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(notification)
    }

    async fn mark_all_read(&self, pool: &PgPool, user_id: Uuid) -> Result<u64> {
        let result = sqlx::query(
            "UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
        )
        .bind(user_id)
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }
}
