use chrono::{DateTime, Duration, Utc};
use rand::RngCore;

pub const API_KEY_PREFIX: &str = "ak_";
const API_KEY_RANDOM_BYTES: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Usability {
    Active,
    Revoked,
    Expired,
}

pub fn generate_plain_key() -> String {
    let mut bytes = [0_u8; API_KEY_RANDOM_BYTES];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!("{API_KEY_PREFIX}{}", hex::encode(bytes))
}

pub fn hash_key(plain_key: &str) -> String {
    format!("{:x}", md5::compute(plain_key))
}

pub fn expires_at_from_days(now: DateTime<Utc>, days: i64) -> DateTime<Utc> {
    now + Duration::days(days)
}

pub fn usability(
    is_active: bool,
    expires_at: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Usability {
    if !is_active {
        return Usability::Revoked;
    }

    if expires_at.is_some_and(|expires_at| now > expires_at) {
        return Usability::Expired;
    }

    Usability::Active
}

pub fn refreshed_expires_days(created_at: DateTime<Utc>, expires_at: DateTime<Utc>) -> i64 {
    (expires_at - created_at).num_days()
}

pub fn refreshed_name(name: &str) -> String {
    format!("{name} (refreshed)")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 4, 24, 12, 0, 0)
            .single()
            .expect("valid fixed datetime")
    }

    #[test]
    fn generated_keys_use_expected_prefix_and_entropy_length() {
        let key = generate_plain_key();

        assert!(key.starts_with(API_KEY_PREFIX));
        assert_eq!(key.len(), API_KEY_PREFIX.len() + (API_KEY_RANDOM_BYTES * 2));
    }

    #[test]
    fn hashes_are_stable_md5_hex_strings() {
        assert_eq!(hash_key("ak_test"), "3066a4c86fd9a8403a7a1c804ee8d4fc");
        assert_eq!(hash_key("ak_test").len(), 32);
    }

    #[test]
    fn expiration_days_are_relative_to_given_time() {
        assert_eq!(expires_at_from_days(now(), 7), now() + Duration::days(7));
    }

    #[test]
    fn usability_prioritizes_revoked_before_expired() {
        assert_eq!(usability(true, None, now()), Usability::Active);
        assert_eq!(
            usability(true, Some(now() + Duration::seconds(1)), now()),
            Usability::Active,
        );
        assert_eq!(
            usability(true, Some(now() - Duration::seconds(1)), now()),
            Usability::Expired,
        );
        assert_eq!(
            usability(false, Some(now() - Duration::seconds(1)), now()),
            Usability::Revoked,
        );
    }

    #[test]
    fn refresh_preserves_original_expiry_window_and_marks_name() {
        assert_eq!(
            refreshed_expires_days(now(), now() + Duration::days(30)),
            30,
        );
        assert_eq!(refreshed_name("Deploy"), "Deploy (refreshed)");
    }
}
