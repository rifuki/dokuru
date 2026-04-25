use async_trait::async_trait;
use eyre::Result;
use sqlx::PgPool;
use uuid::Uuid;

use super::entity::Notification;

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
            "SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE",
        )
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
