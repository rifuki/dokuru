use eyre::Result;
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::feature::{agent::AgentResponse, user::User};

use super::{
    dto::{ListNotificationsQuery, NotificationResponse},
    repository::{CreateNotification, NotificationRepository},
};

const DEFAULT_LIMIT: i64 = 20;
const MAX_LIMIT: i64 = 100;

struct NotificationPayload<'a> {
    kind: &'a str,
    title: &'a str,
    message: &'a str,
    target_path: Option<&'a str>,
    metadata: serde_json::Value,
}

pub struct NotificationService {
    repo: Arc<dyn NotificationRepository>,
}

impl NotificationService {
    pub fn new(repo: Arc<dyn NotificationRepository>) -> Self {
        Self { repo }
    }

    pub async fn list_for_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        query: ListNotificationsQuery,
    ) -> Result<Vec<NotificationResponse>> {
        let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
        let offset = query.offset.unwrap_or(0).max(0);
        let unread_only = query.unread_only.unwrap_or(false);

        let notifications = self
            .repo
            .list_for_user(pool, user_id, limit, offset, unread_only)
            .await?;

        Ok(notifications
            .into_iter()
            .map(NotificationResponse::from)
            .collect())
    }

    pub async fn unread_count(&self, pool: &PgPool, user_id: Uuid) -> Result<i64> {
        self.repo.unread_count(pool, user_id).await
    }

    pub async fn mark_read(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        notification_id: Uuid,
    ) -> Result<Option<NotificationResponse>> {
        Ok(self
            .repo
            .mark_read(pool, user_id, notification_id)
            .await?
            .map(NotificationResponse::from))
    }

    pub async fn mark_all_read(&self, pool: &PgPool, user_id: Uuid) -> Result<u64> {
        self.repo.mark_all_read(pool, user_id).await
    }

    async fn notify_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        payload: NotificationPayload<'_>,
    ) -> Result<()> {
        self.repo
            .create(
                pool,
                CreateNotification {
                    user_id,
                    kind: payload.kind,
                    title: payload.title,
                    message: payload.message,
                    target_path: payload.target_path,
                    metadata: payload.metadata,
                },
            )
            .await?;
        Ok(())
    }

    async fn notify_admins(&self, pool: &PgPool, payload: NotificationPayload<'_>) -> Result<()> {
        self.repo
            .create_for_admins(
                pool,
                payload.kind,
                payload.title,
                payload.message,
                payload.target_path,
                payload.metadata,
            )
            .await?;
        Ok(())
    }

    pub async fn notify_user_registered(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        email: &str,
        username: Option<&str>,
    ) -> Result<()> {
        let display = username.unwrap_or("new user");
        self.notify_user(
            pool,
            user_id,
            NotificationPayload {
                kind: "user.welcome",
                title: "Welcome to Dokuru",
                message: "Add your first Docker agent to start auditing your environment.",
                target_path: Some("/agents"),
                metadata: serde_json::json!({ "user_id": user_id, "email": email }),
            },
        )
        .await?;

        self.notify_admins(
            pool,
            NotificationPayload {
                kind: "admin.user_registered",
                title: "New user registered",
                message: &format!("{display} joined Dokuru."),
                target_path: Some("/admin/users"),
                metadata: serde_json::json!({ "user_id": user_id, "email": email, "username": username }),
            },
        )
        .await
    }

    pub async fn notify_email_verified(&self, pool: &PgPool, user: &User) -> Result<()> {
        self.notify_user(
            pool,
            user.id,
            NotificationPayload {
                kind: "user.email_verified",
                title: "Email verified",
                message: "Your account email is now verified.",
                target_path: Some("/settings/profile"),
                metadata: serde_json::json!({ "user_id": user.id, "email": user.email }),
            },
        )
        .await?;

        self.notify_admins(
            pool,
            NotificationPayload {
                kind: "admin.email_verified",
                title: "User verified email",
                message: &format!("{} verified their email address.", user.email),
                target_path: Some("/admin/users"),
                metadata: serde_json::json!({ "user_id": user.id, "email": user.email }),
            },
        )
        .await
    }

    pub async fn notify_password_changed(&self, pool: &PgPool, user_id: Uuid) -> Result<()> {
        self.notify_user(
            pool,
            user_id,
            NotificationPayload {
                kind: "security.password_changed",
                title: "Password changed",
                message: "Your account password was changed.",
                target_path: Some("/settings/security"),
                metadata: serde_json::json!({ "user_id": user_id }),
            },
        )
        .await?;

        self.notify_admins(
            pool,
            NotificationPayload {
                kind: "admin.password_changed",
                title: "User changed password",
                message: "A user changed their account password.",
                target_path: Some("/admin/users"),
                metadata: serde_json::json!({ "user_id": user_id }),
            },
        )
        .await
    }

    pub async fn notify_agent_created(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        agent: &AgentResponse,
    ) -> Result<()> {
        let target = format!("/agents/{}", agent.id);
        self.notify_user(
            pool,
            user_id,
            NotificationPayload {
                kind: "agent.created",
                title: "Agent added",
                message: &format!("{} is now registered in Dokuru.", agent.name),
                target_path: Some(&target),
                metadata: serde_json::json!({ "agent_id": agent.id, "agent_name": agent.name }),
            },
        )
        .await?;

        self.notify_admins(
            pool,
            NotificationPayload {
                kind: "admin.agent_created",
                title: "Agent registered",
                message: &format!("{} was added by a user.", agent.name),
                target_path: Some("/admin/agents"),
                metadata: serde_json::json!({ "agent_id": agent.id, "agent_name": agent.name, "user_id": user_id }),
            },
        )
        .await
    }

    pub async fn notify_agent_connected(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        agent_id: Uuid,
        agent_name: &str,
    ) -> Result<()> {
        let target = format!("/agents/{agent_id}");
        self.notify_user(
            pool,
            user_id,
            NotificationPayload {
                kind: "agent.connected",
                title: "Agent connected",
                message: &format!("{agent_name} connected to Dokuru."),
                target_path: Some(&target),
                metadata: serde_json::json!({ "agent_id": agent_id, "agent_name": agent_name }),
            },
        )
        .await?;

        self.notify_admins(
            pool,
            NotificationPayload {
                kind: "admin.agent_connected",
                title: "Agent connected",
                message: &format!("{agent_name} connected through the relay."),
                target_path: Some("/admin/agents"),
                metadata: serde_json::json!({ "agent_id": agent_id, "agent_name": agent_name, "user_id": user_id }),
            },
        )
        .await
    }

    pub async fn notify_audit_saved(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        agent: &AgentResponse,
        audit_id: Uuid,
        score: i32,
        failed: i32,
    ) -> Result<()> {
        let target = format!("/agents/{}/audits/{audit_id}", agent.id);
        self.notify_user(
            pool,
            user_id,
            NotificationPayload {
                kind: "audit.completed",
                title: "Audit completed",
                message: &format!(
                    "{} scored {score}% with {failed} failed checks.",
                    agent.name
                ),
                target_path: Some(&target),
                metadata: serde_json::json!({
                    "agent_id": agent.id,
                    "agent_name": agent.name,
                    "audit_id": audit_id,
                    "score": score,
                    "failed": failed
                }),
            },
        )
        .await?;

        self.notify_admins(
            pool,
            NotificationPayload {
                kind: "admin.audit_completed",
                title: "Audit completed",
                message: &format!("{} completed an audit with a {score}% score.", agent.name),
                target_path: Some("/admin/audits"),
                metadata: serde_json::json!({
                    "agent_id": agent.id,
                    "agent_name": agent.name,
                    "audit_id": audit_id,
                    "user_id": user_id,
                    "score": score,
                    "failed": failed
                }),
            },
        )
        .await
    }

    pub async fn notify_bootstrap_admin(&self, pool: &PgPool, user_id: Uuid) -> Result<()> {
        self.notify_user(
            pool,
            user_id,
            NotificationPayload {
                kind: "system.bootstrap",
                title: "Dokuru is ready",
                message: "This is the first admin account for the server.",
                target_path: Some("/admin"),
                metadata: serde_json::json!({ "user_id": user_id }),
            },
        )
        .await
    }
}
