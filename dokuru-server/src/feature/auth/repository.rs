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

    #[error("Session expired - please login again")]
    SessionExpired,

    #[error("User not found")]
    UserNotFound,

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
}

impl From<crate::feature::user::repository::UserRepositoryError> for AuthError {
    fn from(err: crate::feature::user::repository::UserRepositoryError) -> Self {
        use crate::feature::user::repository::UserRepositoryError;
        match err {
            UserRepositoryError::EmailExists => Self::EmailExists,
            UserRepositoryError::UsernameExists => Self::UsernameExists,
            UserRepositoryError::NotFound => Self::UserNotFound,
            UserRepositoryError::Database(e) => Self::Database(e),
        }
    }
}
