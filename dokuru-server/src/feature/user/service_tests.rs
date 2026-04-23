#[cfg(test)]
mod tests {
    use super::super::*;
    use uuid::Uuid;

    #[test]
    fn test_user_id_generation() {
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();

        assert_ne!(id1, id2);
    }

    #[test]
    fn test_user_role_validation() {
        assert!(is_valid_role("admin"));
        assert!(is_valid_role("user"));
        assert!(is_valid_role("moderator"));
        assert!(!is_valid_role("invalid"));
        assert!(!is_valid_role(""));
    }

    #[test]
    fn test_email_normalization() {
        assert_eq!(normalize_email("User@Example.COM"), "user@example.com");
        assert_eq!(normalize_email("TEST@DOMAIN.COM"), "test@domain.com");
    }

    #[test]
    fn test_username_normalization() {
        assert_eq!(normalize_username("UserName"), "username");
        assert_eq!(normalize_username("TEST_USER"), "test_user");
    }

    #[test]
    fn test_profile_completeness() {
        let complete_profile = UserProfile {
            full_name: Some("John Doe".to_string()),
            avatar_url: Some("https://example.com/avatar.jpg".to_string()),
            bio: Some("Developer".to_string()),
        };

        let incomplete_profile = UserProfile {
            full_name: None,
            avatar_url: None,
            bio: None,
        };

        assert!(is_profile_complete(&complete_profile));
        assert!(!is_profile_complete(&incomplete_profile));
    }

    #[test]
    fn test_user_status_check() {
        assert!(is_user_active(true, true));
        assert!(!is_user_active(false, true));
        assert!(!is_user_active(true, false));
        assert!(!is_user_active(false, false));
    }
}

fn is_valid_role(role: &str) -> bool {
    matches!(role, "admin" | "user" | "moderator")
}

fn normalize_email(email: &str) -> String {
    email.to_lowercase()
}

fn normalize_username(username: &str) -> String {
    username.to_lowercase()
}

struct UserProfile {
    full_name: Option<String>,
    avatar_url: Option<String>,
    bio: Option<String>,
}

fn is_profile_complete(profile: &UserProfile) -> bool {
    profile.full_name.is_some() && profile.avatar_url.is_some() && profile.bio.is_some()
}

fn is_user_active(is_active: bool, email_verified: bool) -> bool {
    is_active && email_verified
}
