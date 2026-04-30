use eyre::{Result, eyre};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::feature::{agent::AgentResponse, auth::Role, user::User};

use super::{
    catalog::NotificationKind,
    dto::{
        ListNotificationsQuery, NotificationKindSummaryResponse, NotificationPreferenceResponse,
        NotificationResponse, NotificationSummaryResponse,
    },
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

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
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

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn unread_count(&self, pool: &PgPool, user_id: Uuid) -> Result<i64> {
        self.repo.unread_count(pool, user_id).await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn summary_for_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<NotificationSummaryResponse> {
        let kinds = self
            .repo
            .summary_for_user(pool, user_id)
            .await?
            .into_iter()
            .map(NotificationKindSummaryResponse::from)
            .collect::<Vec<_>>();
        let total = kinds.iter().map(|kind| kind.total).sum();
        let unread = kinds.iter().map(|kind| kind.unread).sum();

        Ok(NotificationSummaryResponse {
            total,
            unread,
            kinds,
        })
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn list_preferences(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        roles: &[Role],
    ) -> Result<Vec<NotificationPreferenceResponse>> {
        let include_admin = roles.contains(&Role::Admin);
        let explicit_preferences = self.repo.list_preferences(pool, user_id).await?;

        Ok(NotificationKind::all()
            .iter()
            .copied()
            .filter(|kind| include_admin || !kind.is_admin())
            .map(|kind| {
                let enabled = if kind.is_configurable() {
                    explicit_preferences
                        .iter()
                        .find(|preference| preference.kind == kind.as_str())
                        .is_none_or(|preference| preference.enabled)
                } else {
                    true
                };

                NotificationPreferenceResponse::new(kind, enabled)
            })
            .collect())
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn set_preference(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        roles: &[Role],
        kind: NotificationKind,
        enabled: bool,
    ) -> Result<NotificationPreferenceResponse> {
        Self::ensure_kind_visible_to_user(kind, roles)?;
        if !kind.is_configurable() {
            return Err(eyre!("This notification preference cannot be changed"));
        }

        let preference = self
            .repo
            .set_preference(pool, user_id, kind.as_str(), enabled)
            .await?;

        Ok(NotificationPreferenceResponse::new(
            kind,
            preference.enabled,
        ))
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn reset_preferences(&self, pool: &PgPool, user_id: Uuid) -> Result<u64> {
        self.repo.reset_preferences(pool, user_id).await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
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

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn mark_all_read(&self, pool: &PgPool, user_id: Uuid) -> Result<u64> {
        self.repo.mark_all_read(pool, user_id).await
    }

    async fn notify_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        payload: NotificationPayload<'_>,
    ) -> Result<()> {
        if !self
            .should_deliver_to_user(pool, user_id, payload.kind)
            .await?
        {
            return Ok(());
        }

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

    async fn should_deliver_to_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        kind: &str,
    ) -> Result<bool> {
        if NotificationKind::from_str(kind).is_some_and(|kind| !kind.is_configurable()) {
            return Ok(true);
        }

        self.repo.is_preference_enabled(pool, user_id, kind).await
    }

    fn ensure_kind_visible_to_user(kind: NotificationKind, roles: &[Role]) -> Result<()> {
        if kind.is_admin() && !roles.contains(&Role::Admin) {
            return Err(eyre!(
                "Admin notification preferences require an admin account"
            ));
        }

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

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
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
                kind: NotificationKind::UserWelcome.as_str(),
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
                kind: NotificationKind::AdminUserRegistered.as_str(),
                title: "New user registered",
                message: &format!("{display} joined Dokuru."),
                target_path: Some("/admin/users"),
                metadata: serde_json::json!({ "user_id": user_id, "email": email, "username": username }),
            },
        )
        .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn notify_email_verified(&self, pool: &PgPool, user: &User) -> Result<()> {
        self.notify_user(
            pool,
            user.id,
            NotificationPayload {
                kind: NotificationKind::UserEmailVerified.as_str(),
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
                kind: NotificationKind::AdminEmailVerified.as_str(),
                title: "User verified email",
                message: &format!("{} verified their email address.", user.email),
                target_path: Some("/admin/users"),
                metadata: serde_json::json!({ "user_id": user.id, "email": user.email }),
            },
        )
        .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn notify_password_changed(&self, pool: &PgPool, user_id: Uuid) -> Result<()> {
        self.notify_user(
            pool,
            user_id,
            NotificationPayload {
                kind: NotificationKind::SecurityPasswordChanged.as_str(),
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
                kind: NotificationKind::AdminPasswordChanged.as_str(),
                title: "User changed password",
                message: "A user changed their account password.",
                target_path: Some("/admin/users"),
                metadata: serde_json::json!({ "user_id": user_id }),
            },
        )
        .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
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
                kind: NotificationKind::AgentCreated.as_str(),
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
                kind: NotificationKind::AdminAgentCreated.as_str(),
                title: "Agent registered",
                message: &format!("{} was added by a user.", agent.name),
                target_path: Some("/admin/agents"),
                metadata: serde_json::json!({ "agent_id": agent.id, "agent_name": agent.name, "user_id": user_id }),
            },
        )
        .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
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
                kind: NotificationKind::AgentConnected.as_str(),
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
                kind: NotificationKind::AdminAgentConnected.as_str(),
                title: "Agent connected",
                message: &format!("{agent_name} connected through the relay."),
                target_path: Some("/admin/agents"),
                metadata: serde_json::json!({ "agent_id": agent_id, "agent_name": agent_name, "user_id": user_id }),
            },
        )
        .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
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
                kind: NotificationKind::AuditCompleted.as_str(),
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
                kind: NotificationKind::AdminAuditCompleted.as_str(),
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

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn notify_bootstrap_admin(&self, pool: &PgPool, user_id: Uuid) -> Result<()> {
        self.notify_user(
            pool,
            user_id,
            NotificationPayload {
                kind: NotificationKind::SystemBootstrap.as_str(),
                title: "Dokuru is ready",
                message: "This is the first admin account for the server.",
                target_path: Some("/admin"),
                metadata: serde_json::json!({ "user_id": user_id }),
            },
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use chrono::Utc;
    use sqlx::PgPool;
    use std::collections::HashMap;
    use std::sync::Mutex;

    use crate::feature::notification::entity::{
        Notification, NotificationPreference, NotificationSummaryRow,
    };

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct ListCall {
        user_id: Uuid,
        limit: i64,
        offset: i64,
        unread_only: bool,
    }

    #[derive(Default)]
    struct FakeNotificationRepository {
        admin_ids: Vec<Uuid>,
        created: Mutex<Vec<Notification>>,
        list_calls: Mutex<Vec<ListCall>>,
        list_result: Mutex<Vec<Notification>>,
        summary_result: Mutex<Vec<NotificationSummaryRow>>,
        mark_read_result: Mutex<Option<Notification>>,
        mark_all_result: Mutex<u64>,
        unread_count_result: Mutex<i64>,
        preferences: Mutex<HashMap<(Uuid, String), bool>>,
    }

    impl FakeNotificationRepository {
        fn with_admins(admin_ids: Vec<Uuid>) -> Self {
            Self {
                admin_ids,
                ..Self::default()
            }
        }

        fn created(&self) -> Vec<Notification> {
            self.created
                .lock()
                .expect("created notification lock should not be poisoned")
                .clone()
        }

        fn list_calls(&self) -> Vec<ListCall> {
            self.list_calls
                .lock()
                .expect("list call lock should not be poisoned")
                .clone()
        }

        fn set_list_result(&self, notifications: Vec<Notification>) {
            *self
                .list_result
                .lock()
                .expect("list result lock should not be poisoned") = notifications;
        }

        fn set_summary_result(&self, rows: Vec<NotificationSummaryRow>) {
            *self
                .summary_result
                .lock()
                .expect("summary result lock should not be poisoned") = rows;
        }

        fn set_mark_read_result(&self, notification: Option<Notification>) {
            *self
                .mark_read_result
                .lock()
                .expect("mark read result lock should not be poisoned") = notification;
        }

        fn set_mark_all_result(&self, updated: u64) {
            *self
                .mark_all_result
                .lock()
                .expect("mark all result lock should not be poisoned") = updated;
        }

        fn set_unread_count(&self, count: i64) {
            *self
                .unread_count_result
                .lock()
                .expect("unread count result lock should not be poisoned") = count;
        }

        fn seed_preference(&self, user_id: Uuid, kind: NotificationKind, enabled: bool) {
            self.preferences
                .lock()
                .expect("preference lock should not be poisoned")
                .insert((user_id, kind.as_str().to_owned()), enabled);
        }

        fn preference_enabled_for(&self, user_id: Uuid, kind: &str) -> bool {
            self.preferences
                .lock()
                .expect("preference lock should not be poisoned")
                .get(&(user_id, kind.to_owned()))
                .copied()
                .unwrap_or(true)
        }
    }

    #[async_trait]
    impl NotificationRepository for FakeNotificationRepository {
        async fn create(
            &self,
            _pool: &PgPool,
            input: CreateNotification<'_>,
        ) -> Result<Notification> {
            let notification = Notification {
                id: Uuid::new_v4(),
                user_id: input.user_id,
                kind: input.kind.to_owned(),
                title: input.title.to_owned(),
                message: input.message.to_owned(),
                target_path: input.target_path.map(str::to_owned),
                metadata: input.metadata,
                read_at: None,
                created_at: Utc::now(),
            };

            self.created
                .lock()
                .expect("created notification lock should not be poisoned")
                .push(notification.clone());

            Ok(notification)
        }

        async fn create_for_admins(
            &self,
            _pool: &PgPool,
            kind: &str,
            title: &str,
            message: &str,
            target_path: Option<&str>,
            metadata: serde_json::Value,
        ) -> Result<Vec<Notification>> {
            let notifications = self
                .admin_ids
                .iter()
                .filter(|user_id| self.preference_enabled_for(**user_id, kind))
                .map(|user_id| Notification {
                    id: Uuid::new_v4(),
                    user_id: *user_id,
                    kind: kind.to_owned(),
                    title: title.to_owned(),
                    message: message.to_owned(),
                    target_path: target_path.map(str::to_owned),
                    metadata: metadata.clone(),
                    read_at: None,
                    created_at: Utc::now(),
                })
                .collect::<Vec<_>>();

            self.created
                .lock()
                .expect("created notification lock should not be poisoned")
                .extend(notifications.clone());

            Ok(notifications)
        }

        async fn list_for_user(
            &self,
            _pool: &PgPool,
            user_id: Uuid,
            limit: i64,
            offset: i64,
            unread_only: bool,
        ) -> Result<Vec<Notification>> {
            self.list_calls
                .lock()
                .expect("list call lock should not be poisoned")
                .push(ListCall {
                    user_id,
                    limit,
                    offset,
                    unread_only,
                });

            Ok(self
                .list_result
                .lock()
                .expect("list result lock should not be poisoned")
                .clone())
        }

        async fn unread_count(&self, _pool: &PgPool, _user_id: Uuid) -> Result<i64> {
            Ok(*self
                .unread_count_result
                .lock()
                .expect("unread count result lock should not be poisoned"))
        }

        async fn summary_for_user(
            &self,
            _pool: &PgPool,
            _user_id: Uuid,
        ) -> Result<Vec<NotificationSummaryRow>> {
            Ok(self
                .summary_result
                .lock()
                .expect("summary result lock should not be poisoned")
                .clone())
        }

        async fn list_preferences(
            &self,
            _pool: &PgPool,
            user_id: Uuid,
        ) -> Result<Vec<NotificationPreference>> {
            Ok(self
                .preferences
                .lock()
                .expect("preference lock should not be poisoned")
                .iter()
                .filter(|((preference_user_id, _), _)| *preference_user_id == user_id)
                .map(
                    |((preference_user_id, kind), enabled)| NotificationPreference {
                        user_id: *preference_user_id,
                        kind: kind.clone(),
                        enabled: *enabled,
                        updated_at: Utc::now(),
                    },
                )
                .collect())
        }

        async fn set_preference(
            &self,
            _pool: &PgPool,
            user_id: Uuid,
            kind: &str,
            enabled: bool,
        ) -> Result<NotificationPreference> {
            self.preferences
                .lock()
                .expect("preference lock should not be poisoned")
                .insert((user_id, kind.to_owned()), enabled);

            Ok(NotificationPreference {
                user_id,
                kind: kind.to_owned(),
                enabled,
                updated_at: Utc::now(),
            })
        }

        async fn reset_preferences(&self, _pool: &PgPool, user_id: Uuid) -> Result<u64> {
            let mut preferences = self
                .preferences
                .lock()
                .expect("preference lock should not be poisoned");
            let before = preferences.len();
            preferences.retain(|(key_user_id, _), _| *key_user_id != user_id);
            Ok((before - preferences.len()) as u64)
        }

        async fn is_preference_enabled(
            &self,
            _pool: &PgPool,
            user_id: Uuid,
            kind: &str,
        ) -> Result<bool> {
            Ok(self.preference_enabled_for(user_id, kind))
        }

        async fn mark_read(
            &self,
            _pool: &PgPool,
            _user_id: Uuid,
            _notification_id: Uuid,
        ) -> Result<Option<Notification>> {
            Ok(self
                .mark_read_result
                .lock()
                .expect("mark read result lock should not be poisoned")
                .clone())
        }

        async fn mark_all_read(&self, _pool: &PgPool, _user_id: Uuid) -> Result<u64> {
            Ok(*self
                .mark_all_result
                .lock()
                .expect("mark all result lock should not be poisoned"))
        }
    }

    fn lazy_pool() -> PgPool {
        PgPool::connect_lazy("postgres://dokuru:secret@localhost:5432/dokuru_db")
            .expect("test database URL should be parseable")
    }

    fn notification_for(user_id: Uuid, kind: &str) -> Notification {
        Notification {
            id: Uuid::new_v4(),
            user_id,
            kind: kind.to_owned(),
            title: "Test notification".to_owned(),
            message: "A test event was recorded.".to_owned(),
            target_path: Some("/notifications".to_owned()),
            metadata: serde_json::json!({ "kind": kind }),
            read_at: None,
            created_at: Utc::now(),
        }
    }

    fn agent_response(id: Uuid, name: &str) -> AgentResponse {
        AgentResponse {
            id,
            name: name.to_owned(),
            url: "http://localhost:8080".to_owned(),
            access_mode: "direct".to_owned(),
            status: "online".to_owned(),
            last_seen: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            token: None,
        }
    }

    #[tokio::test]
    async fn list_for_user_clamps_pagination_and_preserves_filter() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let repo = Arc::new(FakeNotificationRepository::default());
        repo.set_list_result(vec![notification_for(user_id, "audit.completed")]);
        let service = NotificationService::new(repo.clone());

        let notifications = service
            .list_for_user(
                &pool,
                user_id,
                ListNotificationsQuery {
                    limit: Some(500),
                    offset: Some(-20),
                    unread_only: Some(true),
                },
            )
            .await?;

        assert_eq!(notifications.len(), 1);
        assert_eq!(
            repo.list_calls(),
            vec![ListCall {
                user_id,
                limit: MAX_LIMIT,
                offset: 0,
                unread_only: true,
            }]
        );

        Ok(())
    }

    #[tokio::test]
    async fn list_for_user_uses_defaults_for_empty_query() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let repo = Arc::new(FakeNotificationRepository::default());
        let service = NotificationService::new(repo.clone());

        service
            .list_for_user(
                &pool,
                user_id,
                ListNotificationsQuery {
                    limit: None,
                    offset: None,
                    unread_only: None,
                },
            )
            .await?;

        assert_eq!(
            repo.list_calls(),
            vec![ListCall {
                user_id,
                limit: DEFAULT_LIMIT,
                offset: 0,
                unread_only: false,
            }]
        );

        Ok(())
    }

    #[tokio::test]
    async fn user_registration_notifies_new_user_and_active_admins() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let admin_ids = vec![Uuid::new_v4(), Uuid::new_v4()];
        let repo = Arc::new(FakeNotificationRepository::with_admins(admin_ids.clone()));
        let service = NotificationService::new(repo.clone());

        service
            .notify_user_registered(&pool, user_id, "ada@example.com", Some("ada"))
            .await?;

        let created = repo.created();
        assert_eq!(created.len(), 3);

        let welcome = created
            .iter()
            .find(|notification| {
                notification.user_id == user_id && notification.kind == "user.welcome"
            })
            .expect("registered user should receive welcome notification");
        assert_eq!(welcome.title, "Welcome to Dokuru");
        assert_eq!(welcome.target_path.as_deref(), Some("/agents"));
        assert_eq!(welcome.metadata["email"], "ada@example.com");

        assert_eq!(
            created
                .iter()
                .filter(|notification| notification.kind == "admin.user_registered")
                .count(),
            admin_ids.len()
        );
        assert!(admin_ids.iter().all(|admin_id| {
            created.iter().any(|notification| {
                notification.user_id == *admin_id
                    && notification.kind == "admin.user_registered"
                    && notification.message.contains("ada")
            })
        }));

        Ok(())
    }

    #[tokio::test]
    async fn audit_saved_notification_carries_score_target_and_metadata() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let agent_id = Uuid::new_v4();
        let audit_id = Uuid::new_v4();
        let admin_id = Uuid::new_v4();
        let repo = Arc::new(FakeNotificationRepository::with_admins(vec![admin_id]));
        let service = NotificationService::new(repo.clone());
        let agent = agent_response(agent_id, "prod-node-1");

        service
            .notify_audit_saved(&pool, user_id, &agent, audit_id, 84, 7)
            .await?;

        let created = repo.created();
        assert_eq!(created.len(), 2);

        let user_event = created
            .iter()
            .find(|notification| notification.kind == "audit.completed")
            .expect("audit should notify the owning user");
        assert_eq!(user_event.user_id, user_id);
        assert_eq!(
            user_event.target_path.as_deref(),
            Some(format!("/agents/{agent_id}/audits/{audit_id}").as_str())
        );
        assert_eq!(user_event.metadata["agent_id"], agent_id.to_string());
        assert_eq!(user_event.metadata["audit_id"], audit_id.to_string());
        assert_eq!(user_event.metadata["score"], 84);
        assert_eq!(user_event.metadata["failed"], 7);

        let admin_event = created
            .iter()
            .find(|notification| notification.kind == "admin.audit_completed")
            .expect("audit should notify admins");
        assert_eq!(admin_event.user_id, admin_id);
        assert_eq!(admin_event.target_path.as_deref(), Some("/admin/audits"));

        Ok(())
    }

    #[tokio::test]
    async fn read_state_operations_delegate_to_repository() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let notification_id = Uuid::new_v4();
        let repo = Arc::new(FakeNotificationRepository::default());
        repo.set_unread_count(12);
        repo.set_mark_all_result(5);
        repo.set_mark_read_result(Some(Notification {
            id: notification_id,
            ..notification_for(user_id, "security.password_changed")
        }));
        let service = NotificationService::new(repo);

        assert_eq!(service.unread_count(&pool, user_id).await?, 12);
        assert_eq!(service.mark_all_read(&pool, user_id).await?, 5);

        let marked = service
            .mark_read(&pool, user_id, notification_id)
            .await?
            .expect("fake repository should return the marked notification");
        assert_eq!(marked.id, notification_id);
        assert_eq!(marked.kind, "security.password_changed");

        Ok(())
    }

    #[tokio::test]
    async fn summary_rolls_up_totals_and_catalog_metadata() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let repo = Arc::new(FakeNotificationRepository::default());
        repo.set_summary_result(vec![
            NotificationSummaryRow {
                kind: NotificationKind::AuditCompleted.as_str().to_owned(),
                total: 4,
                unread: 1,
                latest_at: Some(Utc::now()),
            },
            NotificationSummaryRow {
                kind: "legacy.custom_event".to_owned(),
                total: 2,
                unread: 2,
                latest_at: None,
            },
        ]);
        let service = NotificationService::new(repo);

        let summary = service.summary_for_user(&pool, user_id).await?;

        assert_eq!(summary.total, 6);
        assert_eq!(summary.unread, 3);
        assert_eq!(summary.kinds.len(), 2);

        let audit = summary
            .kinds
            .iter()
            .find(|kind| kind.kind == "audit.completed")
            .expect("known audit kind should be present");
        assert!(audit.known);
        assert_eq!(audit.audience, Some("user"));
        assert_eq!(audit.severity, Some("success"));
        assert_eq!(audit.target_hint, Some("agent/audits"));

        let legacy = summary
            .kinds
            .iter()
            .find(|kind| kind.kind == "legacy.custom_event")
            .expect("unknown legacy kind should still be summarized");
        assert!(!legacy.known);
        assert_eq!(legacy.audience, None);
        assert_eq!(legacy.severity, None);

        Ok(())
    }

    #[tokio::test]
    async fn preferences_list_defaults_and_role_visible_kinds() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let repo = Arc::new(FakeNotificationRepository::default());
        repo.seed_preference(user_id, NotificationKind::AuditCompleted, false);
        repo.seed_preference(user_id, NotificationKind::SystemBootstrap, false);
        let service = NotificationService::new(repo);

        let user_preferences = service
            .list_preferences(&pool, user_id, &[Role::User])
            .await?;
        assert!(user_preferences.iter().all(|preference| {
            NotificationKind::from_str(&preference.kind).is_some_and(|kind| !kind.is_admin())
        }));
        assert!(
            user_preferences
                .iter()
                .any(|preference| preference.kind == "audit.completed"
                    && !preference.enabled
                    && preference.configurable)
        );
        assert!(
            user_preferences
                .iter()
                .any(|preference| preference.kind == "system.bootstrap"
                    && preference.enabled
                    && !preference.configurable)
        );

        let admin_preferences = service
            .list_preferences(&pool, user_id, &[Role::Admin])
            .await?;
        assert!(admin_preferences.len() > user_preferences.len());
        assert!(
            admin_preferences
                .iter()
                .any(|preference| preference.kind == "admin.audit_completed")
        );

        Ok(())
    }

    #[tokio::test]
    async fn preference_updates_validate_role_and_critical_kinds() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let repo = Arc::new(FakeNotificationRepository::default());
        let service = NotificationService::new(repo);

        let preference = service
            .set_preference(
                &pool,
                user_id,
                &[Role::User],
                NotificationKind::AuditCompleted,
                false,
            )
            .await?;
        assert_eq!(preference.kind, "audit.completed");
        assert!(!preference.enabled);

        let admin_result = service
            .set_preference(
                &pool,
                user_id,
                &[Role::User],
                NotificationKind::AdminAuditCompleted,
                false,
            )
            .await;
        assert!(admin_result.is_err());

        let critical_result = service
            .set_preference(
                &pool,
                user_id,
                &[Role::User],
                NotificationKind::SecurityPasswordChanged,
                false,
            )
            .await;
        assert!(critical_result.is_err());

        Ok(())
    }

    #[tokio::test]
    async fn muted_user_notifications_are_not_persisted() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let agent = agent_response(Uuid::new_v4(), "muted-agent");
        let repo = Arc::new(FakeNotificationRepository::default());
        repo.seed_preference(user_id, NotificationKind::AgentCreated, false);
        let service = NotificationService::new(repo.clone());

        service.notify_agent_created(&pool, user_id, &agent).await?;

        assert!(
            repo.created()
                .iter()
                .all(|notification| notification.kind != "agent.created")
        );

        Ok(())
    }

    #[tokio::test]
    async fn critical_notifications_ignore_muted_preferences() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let repo = Arc::new(FakeNotificationRepository::default());
        repo.seed_preference(user_id, NotificationKind::SecurityPasswordChanged, false);
        let service = NotificationService::new(repo.clone());

        service.notify_password_changed(&pool, user_id).await?;

        assert!(repo.created().iter().any(|notification| {
            notification.user_id == user_id && notification.kind == "security.password_changed"
        }));

        Ok(())
    }

    #[tokio::test]
    async fn reset_preferences_deletes_user_overrides() -> Result<()> {
        let pool = lazy_pool();
        let user_id = Uuid::new_v4();
        let other_user_id = Uuid::new_v4();
        let repo = Arc::new(FakeNotificationRepository::default());
        repo.seed_preference(user_id, NotificationKind::AuditCompleted, false);
        repo.seed_preference(user_id, NotificationKind::AgentCreated, false);
        repo.seed_preference(other_user_id, NotificationKind::AuditCompleted, false);
        let service = NotificationService::new(repo.clone());

        assert_eq!(service.reset_preferences(&pool, user_id).await?, 2);
        assert!(repo.preference_enabled_for(user_id, NotificationKind::AuditCompleted.as_str()));
        assert!(
            !repo.preference_enabled_for(other_user_id, NotificationKind::AuditCompleted.as_str())
        );

        Ok(())
    }
}
