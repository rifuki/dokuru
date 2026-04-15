/// Auth service errors
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Email already exists")]
    EmailExists,

    #[error("Username already exists")]
    UsernameExists,

    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("Password hashing failed")]
    HashError,

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
}

impl From<crate::feature::user::repository::UserRepositoryError> for AuthError {
    fn from(err: crate::feature::user::repository::UserRepositoryError) -> Self {
        use crate::feature::user::repository::UserRepositoryError;
        match err {
            UserRepositoryError::EmailExists => AuthError::EmailExists,
            UserRepositoryError::UsernameExists => AuthError::UsernameExists,
            UserRepositoryError::HashError => AuthError::HashError,
            UserRepositoryError::Database(e) => AuthError::Database(e),
        }
    }
}
