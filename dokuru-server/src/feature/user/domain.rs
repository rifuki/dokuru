use crate::feature::{auth::types::Role, user::entity::UserProfile};

pub const DEFAULT_ROLE: Role = Role::User;

#[must_use]
pub fn parse_role_or_default(role: &str) -> Role {
    Role::try_from(role).unwrap_or(DEFAULT_ROLE)
}

#[must_use]
pub fn is_valid_role(role: &str) -> bool {
    Role::try_from(role).is_ok()
}

#[must_use]
pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

#[must_use]
pub fn normalize_username(username: &str) -> String {
    username.trim().to_lowercase()
}

#[must_use]
pub const fn is_user_active(is_active: bool, email_verified: bool) -> bool {
    is_active && email_verified
}

#[must_use]
pub fn is_profile_complete(profile: &UserProfile) -> bool {
    profile
        .full_name
        .as_ref()
        .is_some_and(|name| !name.trim().is_empty())
        && profile.avatar_url.is_some()
        && profile
            .bio
            .as_ref()
            .is_some_and(|bio| !bio.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    fn profile(
        full_name: Option<&str>,
        avatar_url: Option<&str>,
        bio: Option<&str>,
    ) -> UserProfile {
        UserProfile {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            full_name: full_name.map(str::to_string),
            display_name: None,
            date_of_birth: None,
            gender: None,
            phone_number: None,
            phone_verified: false,
            address_line1: None,
            address_line2: None,
            city: None,
            state_province: None,
            postal_code: None,
            country_code: None,
            avatar_url: avatar_url.map(str::to_string),
            cover_image_url: None,
            bio: bio.map(str::to_string),
            website_url: None,
            timezone: "UTC".to_string(),
            locale: "en".to_string(),
            social_links: serde_json::json!({}),
            is_profile_public: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn validates_known_roles() {
        assert!(is_valid_role("admin"));
        assert!(is_valid_role("user"));
        assert!(!is_valid_role("moderator"));
        assert!(!is_valid_role(""));
    }

    #[test]
    fn unknown_roles_fall_back_to_user() {
        assert_eq!(parse_role_or_default("admin"), Role::Admin);
        assert_eq!(parse_role_or_default("invalid"), Role::User);
    }

    #[test]
    fn normalizes_identity_fields() {
        assert_eq!(normalize_email(" User@Example.COM "), "user@example.com");
        assert_eq!(normalize_username(" TEST_USER "), "test_user");
    }

    #[test]
    fn active_users_must_be_enabled_and_verified() {
        assert!(is_user_active(true, true));
        assert!(!is_user_active(false, true));
        assert!(!is_user_active(true, false));
        assert!(!is_user_active(false, false));
    }

    #[test]
    fn profile_completeness_requires_name_avatar_and_bio() {
        assert!(is_profile_complete(&profile(
            Some("John Doe"),
            Some("https://example.com/avatar.jpg"),
            Some("Developer"),
        )));
        assert!(!is_profile_complete(&profile(None, None, None)));
        assert!(!is_profile_complete(&profile(
            Some(" "),
            Some("https://example.com/avatar.jpg"),
            Some("Developer"),
        )));
    }
}
