#[cfg(test)]
mod tests {
    use crate::feature::user::entity::{User, UserProfile, UserWithProfile};
    use crate::feature::auth::types::Role;
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn test_user_creation() {
        let user = User {
            id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            username: Some("testuser".to_string()),
            is_active: true,
            email_verified: false,
            role: "user".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert_eq!(user.email, "test@example.com");
        assert!(user.is_active);
        assert!(!user.email_verified);
    }

    #[test]
    fn test_user_role_parsing() {
        let user = User {
            id: Uuid::new_v4(),
            email: "admin@example.com".to_string(),
            username: None,
            is_active: true,
            email_verified: true,
            role: "admin".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert_eq!(user.role(), Role::Admin);
    }

    #[test]
    fn test_user_role_default_fallback() {
        let user = User {
            id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            username: None,
            is_active: true,
            email_verified: false,
            role: "invalid_role".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert_eq!(user.role(), Role::User);
    }

    #[test]
    fn test_user_without_username() {
        let user = User {
            id: Uuid::new_v4(),
            email: "nousername@example.com".to_string(),
            username: None,
            is_active: true,
            email_verified: true,
            role: "user".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert!(user.username.is_none());
    }

    #[test]
    fn test_user_serialization() {
        let user = User {
            id: Uuid::new_v4(),
            email: "serialize@example.com".to_string(),
            username: Some("serialuser".to_string()),
            is_active: true,
            email_verified: true,
            role: "user".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let json = serde_json::to_string(&user).unwrap();
        assert!(json.contains("serialize@example.com"));
        assert!(json.contains("serialuser"));
    }

    #[test]
    fn test_user_profile_creation() {
        let profile = UserProfile {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            full_name: Some("John Doe".to_string()),
            display_name: Some("johnd".to_string()),
            date_of_birth: None,
            gender: None,
            phone_number: Some("+1234567890".to_string()),
            phone_verified: false,
            address_line1: None,
            address_line2: None,
            city: None,
            state_province: None,
            postal_code: None,
            country_code: None,
            avatar_url: Some("https://example.com/avatar.jpg".to_string()),
            cover_image_url: None,
            bio: Some("Software developer".to_string()),
            website_url: Some("https://johndoe.com".to_string()),
            timezone: "UTC".to_string(),
            locale: "en-US".to_string(),
            social_links: serde_json::json!({}),
            is_profile_public: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert_eq!(profile.full_name, Some("John Doe".to_string()));
        assert!(profile.is_profile_public);
    }

    #[test]
    fn test_user_profile_with_address() {
        let profile = UserProfile {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            full_name: Some("Jane Smith".to_string()),
            display_name: None,
            date_of_birth: None,
            gender: Some("female".to_string()),
            phone_number: None,
            phone_verified: false,
            address_line1: Some("123 Main St".to_string()),
            address_line2: Some("Apt 4B".to_string()),
            city: Some("New York".to_string()),
            state_province: Some("NY".to_string()),
            postal_code: Some("10001".to_string()),
            country_code: Some("US".to_string()),
            avatar_url: None,
            cover_image_url: None,
            bio: None,
            website_url: None,
            timezone: "America/New_York".to_string(),
            locale: "en-US".to_string(),
            social_links: serde_json::json!({}),
            is_profile_public: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert_eq!(profile.city, Some("New York".to_string()));
        assert_eq!(profile.postal_code, Some("10001".to_string()));
        assert!(!profile.is_profile_public);
    }

    #[test]
    fn test_user_profile_social_links() {
        let social_links = serde_json::json!({
            "twitter": "https://twitter.com/user",
            "github": "https://github.com/user",
            "linkedin": "https://linkedin.com/in/user"
        });

        let profile = UserProfile {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            full_name: None,
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
            avatar_url: None,
            cover_image_url: None,
            bio: None,
            website_url: None,
            timezone: "UTC".to_string(),
            locale: "en-US".to_string(),
            social_links: social_links.clone(),
            is_profile_public: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert_eq!(profile.social_links, social_links);
        assert!(profile.social_links.get("twitter").is_some());
    }

    #[test]
    fn test_user_with_profile_creation() {
        let user_with_profile = UserWithProfile {
            id: Uuid::new_v4(),
            email: "complete@example.com".to_string(),
            username: Some("completeuser".to_string()),
            is_active: true,
            email_verified: true,
            role: "user".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            full_name: Some("Complete User".to_string()),
            display_name: Some("complete".to_string()),
            avatar_url: Some("https://example.com/avatar.jpg".to_string()),
            bio: Some("Full stack developer".to_string()),
            phone_number: Some("+1234567890".to_string()),
        };

        assert_eq!(user_with_profile.email, "complete@example.com");
        assert_eq!(user_with_profile.full_name, Some("Complete User".to_string()));
    }

    #[test]
    fn test_user_with_profile_role() {
        let user_with_profile = UserWithProfile {
            id: Uuid::new_v4(),
            email: "admin@example.com".to_string(),
            username: None,
            is_active: true,
            email_verified: true,
            role: "admin".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            full_name: None,
            display_name: None,
            avatar_url: None,
            bio: None,
            phone_number: None,
        };

        assert_eq!(user_with_profile.role(), Role::Admin);
    }

    #[test]
    fn test_user_clone() {
        let user = User {
            id: Uuid::new_v4(),
            email: "clone@example.com".to_string(),
            username: Some("cloneuser".to_string()),
            is_active: true,
            email_verified: false,
            role: "user".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let cloned = user.clone();
        assert_eq!(user.email, cloned.email);
        assert_eq!(user.id, cloned.id);
    }

    #[test]
    fn test_user_profile_timezone_variants() {
        let timezones = vec!["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];

        for tz in timezones {
            let profile = UserProfile {
                id: Uuid::new_v4(),
                user_id: Uuid::new_v4(),
                full_name: None,
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
                avatar_url: None,
                cover_image_url: None,
                bio: None,
                website_url: None,
                timezone: tz.to_string(),
                locale: "en-US".to_string(),
                social_links: serde_json::json!({}),
                is_profile_public: true,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            };

            assert_eq!(profile.timezone, tz);
        }
    }

    #[test]
    fn test_user_profile_locale_variants() {
        let locales = vec!["en-US", "es-ES", "fr-FR", "de-DE", "ja-JP"];

        for locale in locales {
            let profile = UserProfile {
                id: Uuid::new_v4(),
                user_id: Uuid::new_v4(),
                full_name: None,
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
                avatar_url: None,
                cover_image_url: None,
                bio: None,
                website_url: None,
                timezone: "UTC".to_string(),
                locale: locale.to_string(),
                social_links: serde_json::json!({}),
                is_profile_public: true,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            };

            assert_eq!(profile.locale, locale);
        }
    }

    #[test]
    fn test_user_email_formats() {
        let emails = vec![
            "simple@example.com",
            "user+tag@example.com",
            "user.name@example.co.uk",
            "123@example.com",
        ];

        for email in emails {
            let user = User {
                id: Uuid::new_v4(),
                email: email.to_string(),
                username: None,
                is_active: true,
                email_verified: false,
                role: "user".to_string(),
                created_at: Utc::now(),
                updated_at: Utc::now(),
            };

            assert_eq!(user.email, email);
        }
    }

    #[test]
    fn test_user_inactive() {
        let user = User {
            id: Uuid::new_v4(),
            email: "inactive@example.com".to_string(),
            username: None,
            is_active: false,
            email_verified: false,
            role: "user".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert!(!user.is_active);
    }

    #[test]
    fn test_user_profile_phone_verified() {
        let profile = UserProfile {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            full_name: None,
            display_name: None,
            date_of_birth: None,
            gender: None,
            phone_number: Some("+1234567890".to_string()),
            phone_verified: true,
            address_line1: None,
            address_line2: None,
            city: None,
            state_province: None,
            postal_code: None,
            country_code: None,
            avatar_url: None,
            cover_image_url: None,
            bio: None,
            website_url: None,
            timezone: "UTC".to_string(),
            locale: "en-US".to_string(),
            social_links: serde_json::json!({}),
            is_profile_public: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert!(profile.phone_verified);
        assert!(profile.phone_number.is_some());
    }
}
