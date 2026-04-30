#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NotificationAudience {
    User,
    Admin,
}

impl NotificationAudience {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Admin => "admin",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NotificationSeverity {
    Info,
    Success,
    Warning,
}

impl NotificationSeverity {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Info => "info",
            Self::Success => "success",
            Self::Warning => "warning",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NotificationKind {
    UserWelcome,
    AdminUserRegistered,
    UserEmailVerified,
    AdminEmailVerified,
    SecurityPasswordChanged,
    AdminPasswordChanged,
    AgentCreated,
    AdminAgentCreated,
    AgentConnected,
    AdminAgentConnected,
    AuditCompleted,
    AdminAuditCompleted,
    SystemBootstrap,
}

const ALL_NOTIFICATION_KINDS: [NotificationKind; 13] = [
    NotificationKind::UserWelcome,
    NotificationKind::AdminUserRegistered,
    NotificationKind::UserEmailVerified,
    NotificationKind::AdminEmailVerified,
    NotificationKind::SecurityPasswordChanged,
    NotificationKind::AdminPasswordChanged,
    NotificationKind::AgentCreated,
    NotificationKind::AdminAgentCreated,
    NotificationKind::AgentConnected,
    NotificationKind::AdminAgentConnected,
    NotificationKind::AuditCompleted,
    NotificationKind::AdminAuditCompleted,
    NotificationKind::SystemBootstrap,
];

impl NotificationKind {
    #[must_use]
    pub const fn all() -> &'static [Self] {
        &ALL_NOTIFICATION_KINDS
    }

    #[must_use]
    pub const fn from_str(kind: &str) -> Option<Self> {
        match kind.as_bytes() {
            b"user.welcome" => Some(Self::UserWelcome),
            b"admin.user_registered" => Some(Self::AdminUserRegistered),
            b"user.email_verified" => Some(Self::UserEmailVerified),
            b"admin.email_verified" => Some(Self::AdminEmailVerified),
            b"security.password_changed" => Some(Self::SecurityPasswordChanged),
            b"admin.password_changed" => Some(Self::AdminPasswordChanged),
            b"agent.created" => Some(Self::AgentCreated),
            b"admin.agent_created" => Some(Self::AdminAgentCreated),
            b"agent.connected" => Some(Self::AgentConnected),
            b"admin.agent_connected" => Some(Self::AdminAgentConnected),
            b"audit.completed" => Some(Self::AuditCompleted),
            b"admin.audit_completed" => Some(Self::AdminAuditCompleted),
            b"system.bootstrap" => Some(Self::SystemBootstrap),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UserWelcome => "user.welcome",
            Self::AdminUserRegistered => "admin.user_registered",
            Self::UserEmailVerified => "user.email_verified",
            Self::AdminEmailVerified => "admin.email_verified",
            Self::SecurityPasswordChanged => "security.password_changed",
            Self::AdminPasswordChanged => "admin.password_changed",
            Self::AgentCreated => "agent.created",
            Self::AdminAgentCreated => "admin.agent_created",
            Self::AgentConnected => "agent.connected",
            Self::AdminAgentConnected => "admin.agent_connected",
            Self::AuditCompleted => "audit.completed",
            Self::AdminAuditCompleted => "admin.audit_completed",
            Self::SystemBootstrap => "system.bootstrap",
        }
    }

    #[must_use]
    pub const fn is_admin(self) -> bool {
        matches!(self.audience(), NotificationAudience::Admin)
    }

    #[must_use]
    pub const fn is_configurable(self) -> bool {
        !matches!(
            self,
            Self::SecurityPasswordChanged | Self::AdminPasswordChanged | Self::SystemBootstrap
        )
    }

    #[must_use]
    pub const fn audience(self) -> NotificationAudience {
        match self {
            Self::AdminUserRegistered
            | Self::AdminEmailVerified
            | Self::AdminPasswordChanged
            | Self::AdminAgentCreated
            | Self::AdminAgentConnected
            | Self::AdminAuditCompleted => NotificationAudience::Admin,
            Self::UserWelcome
            | Self::UserEmailVerified
            | Self::SecurityPasswordChanged
            | Self::AgentCreated
            | Self::AgentConnected
            | Self::AuditCompleted
            | Self::SystemBootstrap => NotificationAudience::User,
        }
    }

    #[must_use]
    pub const fn severity(self) -> NotificationSeverity {
        match self {
            Self::SecurityPasswordChanged | Self::AdminPasswordChanged => {
                NotificationSeverity::Warning
            }
            Self::UserEmailVerified
            | Self::AgentCreated
            | Self::AgentConnected
            | Self::AuditCompleted
            | Self::SystemBootstrap => NotificationSeverity::Success,
            Self::UserWelcome
            | Self::AdminUserRegistered
            | Self::AdminEmailVerified
            | Self::AdminAgentCreated
            | Self::AdminAgentConnected
            | Self::AdminAuditCompleted => NotificationSeverity::Info,
        }
    }

    #[must_use]
    pub const fn target_hint(self) -> &'static str {
        match self {
            Self::UserWelcome | Self::AgentCreated | Self::AgentConnected => "agents",
            Self::UserEmailVerified => "settings/profile",
            Self::SecurityPasswordChanged => "settings/security",
            Self::AuditCompleted => "agent/audits",
            Self::SystemBootstrap => "admin",
            Self::AdminUserRegistered | Self::AdminEmailVerified | Self::AdminPasswordChanged => {
                "admin/users"
            }
            Self::AdminAgentCreated | Self::AdminAgentConnected => "admin/agents",
            Self::AdminAuditCompleted => "admin/audits",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{NotificationAudience, NotificationKind, NotificationSeverity};

    #[test]
    fn serialized_kinds_are_stable_for_persisted_notifications() {
        let serialized = NotificationKind::all()
            .into_iter()
            .copied()
            .map(NotificationKind::as_str)
            .collect::<Vec<_>>();

        assert_eq!(
            serialized,
            vec![
                "user.welcome",
                "admin.user_registered",
                "user.email_verified",
                "admin.email_verified",
                "security.password_changed",
                "admin.password_changed",
                "agent.created",
                "admin.agent_created",
                "agent.connected",
                "admin.agent_connected",
                "audit.completed",
                "admin.audit_completed",
                "system.bootstrap",
            ]
        );
    }

    #[test]
    fn serialized_kinds_round_trip_from_database_values() {
        for kind in NotificationKind::all() {
            assert_eq!(NotificationKind::from_str(kind.as_str()), Some(*kind));
        }

        assert_eq!(NotificationKind::from_str("admin.audit.finished"), None);
        assert_eq!(NotificationKind::from_str(""), None);
    }

    #[test]
    fn admin_events_are_classified_by_audience() {
        for kind in NotificationKind::all().iter().copied() {
            let serialized = kind.as_str();
            if serialized.starts_with("admin.") {
                assert_eq!(kind.audience(), NotificationAudience::Admin);
                assert!(kind.is_admin());
            } else {
                assert_eq!(kind.audience(), NotificationAudience::User);
                assert!(!kind.is_admin());
            }
        }
    }

    #[test]
    fn security_events_are_warning_severity() {
        assert_eq!(
            NotificationKind::SecurityPasswordChanged.severity(),
            NotificationSeverity::Warning
        );
        assert_eq!(
            NotificationKind::AdminPasswordChanged.severity(),
            NotificationSeverity::Warning
        );
    }

    #[test]
    fn critical_security_and_bootstrap_events_cannot_be_disabled() {
        assert!(!NotificationKind::SecurityPasswordChanged.is_configurable());
        assert!(!NotificationKind::AdminPasswordChanged.is_configurable());
        assert!(!NotificationKind::SystemBootstrap.is_configurable());
        assert!(NotificationKind::AuditCompleted.is_configurable());
        assert!(NotificationKind::AdminAuditCompleted.is_configurable());
    }

    #[test]
    fn audience_and_severity_labels_are_api_stable() {
        assert_eq!(NotificationAudience::User.as_str(), "user");
        assert_eq!(NotificationAudience::Admin.as_str(), "admin");
        assert_eq!(NotificationSeverity::Info.as_str(), "info");
        assert_eq!(NotificationSeverity::Success.as_str(), "success");
        assert_eq!(NotificationSeverity::Warning.as_str(), "warning");
    }

    #[test]
    fn target_hints_group_events_by_primary_screen() {
        assert_eq!(NotificationKind::UserWelcome.target_hint(), "agents");
        assert_eq!(
            NotificationKind::SecurityPasswordChanged.target_hint(),
            "settings/security"
        );
        assert_eq!(
            NotificationKind::AdminAuditCompleted.target_hint(),
            "admin/audits"
        );
    }
}
