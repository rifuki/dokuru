use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

use crate::feature::user;

pub const ADMIN_BLOCKED_SESSION_REASON: &str = "admin_blocked";
pub const ADMIN_DELETED_SESSION_REASON: &str = "admin_deleted";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdminUserAction {
    ChangeRole,
    ChangeStatus,
    ResetPassword,
    Delete,
}

#[must_use]
pub fn normalize_admin_role(role: &str) -> Option<String> {
    let role = user::domain::normalize_username(role);

    if user::domain::is_valid_role(&role) {
        Some(role)
    } else {
        None
    }
}

#[must_use]
pub const fn is_self_action(target_user_id: Uuid, actor_user_id: Uuid) -> bool {
    target_user_id.as_u128() == actor_user_id.as_u128()
}

#[must_use]
pub const fn self_action_message(action: AdminUserAction) -> &'static str {
    match action {
        AdminUserAction::ChangeRole => "Cannot change your own role",
        AdminUserAction::ChangeStatus => "Cannot change your own account status",
        AdminUserAction::ResetPassword => {
            "Use the profile security page to reset your own password"
        }
        AdminUserAction::Delete => "Cannot delete your own account",
    }
}

#[must_use]
pub const fn status_update_message(is_active: bool) -> &'static str {
    if is_active {
        "User account restored"
    } else {
        "User account blocked"
    }
}

#[must_use]
pub fn password_reset_expires_at(now: DateTime<Utc>) -> DateTime<Utc> {
    now + Duration::hours(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn normalizes_supported_admin_roles() {
        assert_eq!(normalize_admin_role(" ADMIN "), Some("admin".to_string()));
        assert_eq!(normalize_admin_role("User"), Some("user".to_string()));
        assert_eq!(normalize_admin_role("moderator"), None);
        assert_eq!(normalize_admin_role(""), None);
    }

    #[test]
    fn detects_self_actions() {
        let user_id = Uuid::new_v4();
        assert!(is_self_action(user_id, user_id));
        assert!(!is_self_action(user_id, Uuid::new_v4()));
    }

    #[test]
    fn provides_action_specific_self_guard_messages() {
        assert_eq!(
            self_action_message(AdminUserAction::ChangeRole),
            "Cannot change your own role",
        );
        assert_eq!(
            self_action_message(AdminUserAction::ChangeStatus),
            "Cannot change your own account status",
        );
        assert_eq!(
            self_action_message(AdminUserAction::ResetPassword),
            "Use the profile security page to reset your own password",
        );
        assert_eq!(
            self_action_message(AdminUserAction::Delete),
            "Cannot delete your own account",
        );
    }

    #[test]
    fn builds_status_and_reset_expiry_values() {
        let now = Utc
            .with_ymd_and_hms(2026, 4, 24, 12, 0, 0)
            .single()
            .expect("valid fixed datetime");

        assert_eq!(status_update_message(true), "User account restored");
        assert_eq!(status_update_message(false), "User account blocked");
        assert_eq!(password_reset_expires_at(now), now + Duration::hours(1));
    }
}
