#[cfg(test)]
mod tests {
    use super::super::*;

    #[test]
    fn test_email_validation() {
        assert!(is_valid_email("user@example.com"));
        assert!(is_valid_email("test.user@domain.co.uk"));
        assert!(!is_valid_email("invalid-email"));
        assert!(!is_valid_email("@example.com"));
        assert!(!is_valid_email("user@"));
    }

    #[test]
    fn test_password_strength() {
        assert!(is_strong_password("StrongP@ss123"));
        assert!(is_strong_password("MyP@ssw0rd!"));
        assert!(!is_strong_password("weak"));
        assert!(!is_strong_password("12345678"));
        assert!(!is_strong_password("password"));
    }

    #[test]
    fn test_username_validation() {
        assert!(is_valid_username("user123"));
        assert!(is_valid_username("test_user"));
        assert!(is_valid_username("user-name"));
        assert!(!is_valid_username("ab")); // too short
        assert!(!is_valid_username("user@name")); // invalid char
        assert!(!is_valid_username("user name")); // space
    }

    #[test]
    fn test_token_generation() {
        let token1 = generate_token(32);
        let token2 = generate_token(32);

        assert_eq!(token1.len(), 64); // hex encoded
        assert_eq!(token2.len(), 64);
        assert_ne!(token1, token2); // should be unique
    }

    #[test]
    fn test_hash_password() {
        let password = "TestPassword123!";
        let hash = hash_password(password).unwrap();

        assert!(!hash.is_empty());
        assert_ne!(hash, password);
        assert!(hash.starts_with("$argon2"));
    }

    #[test]
    fn test_verify_password() {
        let password = "TestPassword123!";
        let hash = hash_password(password).unwrap();

        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password("WrongPassword", &hash).unwrap());
    }
}

fn is_valid_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() > 5
}

fn is_strong_password(password: &str) -> bool {
    password.len() >= 8
        && password.chars().any(|c| c.is_uppercase())
        && password.chars().any(|c| c.is_lowercase())
        && password.chars().any(|c| c.is_numeric())
}

fn is_valid_username(username: &str) -> bool {
    username.len() >= 3
        && username.len() <= 50
        && username
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

fn generate_token(length: usize) -> String {
    let bytes: Vec<u8> = (0..length).map(|_| rand::random::<u8>()).collect();
    hex::encode(bytes)
}

fn hash_password(password: &str) -> eyre::Result<String> {
    use argon2::{
        Argon2,
        password_hash::{PasswordHasher, SaltString, rand_core::OsRng},
    };

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| eyre::eyre!("Failed to hash password: {}", e))?;

    Ok(hash.to_string())
}

fn verify_password(password: &str, hash: &str) -> eyre::Result<bool> {
    use argon2::{
        Argon2,
        password_hash::{PasswordHash, PasswordVerifier},
    };

    let parsed_hash =
        PasswordHash::new(hash).map_err(|e| eyre::eyre!("Failed to parse hash: {}", e))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}
