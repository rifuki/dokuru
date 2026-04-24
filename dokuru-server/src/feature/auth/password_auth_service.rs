use std::sync::Arc;

use uuid::Uuid;

use super::{
    auth_method::{AuthMethodService, AuthProvider},
    credentials::LoginCredentials,
    repository::AuthError,
};
use crate::{
    feature::user::{User, repository::UserRepository},
    infrastructure::persistence::Database,
};

/// Service for password-based authentication
#[derive(Clone)]
pub struct PasswordAuthService {
    db: Database,
    user_repo: Arc<dyn UserRepository>,
    auth_method_service: AuthMethodService,
}

impl PasswordAuthService {
    #[must_use]
    pub fn new(
        db: Database,
        user_repo: Arc<dyn UserRepository>,
        auth_method_service: AuthMethodService,
    ) -> Self {
        Self {
            db,
            user_repo,
            auth_method_service,
        }
    }

    /// Authenticate user with password credentials
    ///
    /// # Errors
    ///
    /// Returns `AuthError` if user not found, password invalid, or user inactive
    pub async fn authenticate(&self, credentials: &LoginCredentials) -> Result<User, AuthError> {
        let user = self.find_user(&credentials.identifier).await?;
        self.verify_user_active(&user)?;
        self.verify_password(&user, &credentials.password).await?;
        self.touch_auth_method(user.id).await;
        Ok(user)
    }

    async fn find_user(&self, identifier: &str) -> Result<User, AuthError> {
        if let Some(user) = self
            .user_repo
            .find_by_email(self.db.pool(), identifier)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
        {
            return Ok(user);
        }

        self.user_repo
            .find_by_username(self.db.pool(), identifier)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
            .ok_or(AuthError::InvalidCredentials)
    }

    fn verify_user_active(&self, user: &User) -> Result<(), AuthError> {
        if user.is_active {
            Ok(())
        } else {
            Err(AuthError::InvalidCredentials)
        }
    }

    async fn verify_password(&self, user: &User, password: &str) -> Result<(), AuthError> {
        let auth_method = self
            .auth_method_service
            .find_by_user_and_provider(user.id, AuthProvider::Password)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
            .ok_or(AuthError::InvalidCredentials)?;

        if auth_method
            .verify_password(password)
            .map_err(|_| AuthError::HashError)?
        {
            Ok(())
        } else {
            Err(AuthError::InvalidCredentials)
        }
    }

    async fn touch_auth_method(&self, user_id: Uuid) {
        if let Ok(Some(auth_method)) = self
            .auth_method_service
            .find_by_user_and_provider(user_id, AuthProvider::Password)
            .await
        {
            let _ = self.auth_method_service.touch(auth_method.id).await;
        }
    }

    /// Get auth method service reference
    #[must_use]
    pub const fn auth_method_service(&self) -> &AuthMethodService {
        &self.auth_method_service
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests will be added in next phase
}
