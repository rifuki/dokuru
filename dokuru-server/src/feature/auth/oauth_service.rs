use std::sync::Arc;

use super::{
    auth_method::AuthMethodService, credentials::OAuthCredentials, repository::AuthError,
};
use crate::{
    feature::user::{User, UserProfileRepository, repository::UserRepository},
    infrastructure::persistence::Database,
};

/// Service for OAuth authentication
#[derive(Clone)]
pub struct OAuthService {
    db: Database,
    user_repo: Arc<dyn UserRepository>,
    profile_repo: Arc<dyn UserProfileRepository>,
    auth_method_service: AuthMethodService,
}

impl OAuthService {
    #[must_use]
    pub fn new(
        db: Database,
        user_repo: Arc<dyn UserRepository>,
        profile_repo: Arc<dyn UserProfileRepository>,
        auth_method_service: AuthMethodService,
    ) -> Self {
        Self {
            db,
            user_repo,
            profile_repo,
            auth_method_service,
        }
    }

    /// Authenticate or register user via OAuth
    ///
    /// # Errors
    ///
    /// Returns `AuthError` if database operations fail
    pub async fn authenticate_or_register(
        &self,
        credentials: &OAuthCredentials,
    ) -> Result<User, AuthError> {
        if let Some(user) = self.find_existing_oauth_user(credentials).await? {
            return Ok(user);
        }

        if let Some(user) = self.find_user_by_email(&credentials.email).await? {
            self.link_oauth_account(&user, credentials).await?;
            return Ok(user);
        }

        self.register_new_oauth_user(credentials).await
    }

    async fn find_existing_oauth_user(
        &self,
        credentials: &OAuthCredentials,
    ) -> Result<Option<User>, AuthError> {
        let auth_method = self
            .auth_method_service
            .find_by_provider_id(credentials.provider, &credentials.provider_id)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        if let Some(method) = auth_method {
            let user = self
                .user_repo
                .find_by_id(self.db.pool(), method.user_id)
                .await
                .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;
            return Ok(user);
        }

        Ok(None)
    }

    async fn find_user_by_email(&self, email: &str) -> Result<Option<User>, AuthError> {
        self.user_repo
            .find_by_email(self.db.pool(), email)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))
    }

    async fn link_oauth_account(
        &self,
        user: &User,
        credentials: &OAuthCredentials,
    ) -> Result<(), AuthError> {
        self.auth_method_service
            .create_oauth_auth(
                user.id,
                credentials.provider,
                &credentials.provider_id,
                credentials.access_token.as_deref(),
                credentials.refresh_token.as_deref(),
                credentials.expires_at,
                false,
            )
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;
        Ok(())
    }

    async fn register_new_oauth_user(
        &self,
        credentials: &OAuthCredentials,
    ) -> Result<User, AuthError> {
        let user = self
            .user_repo
            .create(self.db.pool(), &credentials.email, None)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        self.create_profile(&user, credentials).await?;
        self.create_oauth_auth_method(&user, credentials).await?;

        Ok(user)
    }

    async fn create_profile(
        &self,
        user: &User,
        credentials: &OAuthCredentials,
    ) -> Result<(), AuthError> {
        self.profile_repo
            .create(self.db.pool(), user.id)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        if let Some(name) = &credentials.name {
            let _ = self
                .profile_repo
                .update(self.db.pool(), user.id, Some(name), None, None, None)
                .await;
        }

        Ok(())
    }

    async fn create_oauth_auth_method(
        &self,
        user: &User,
        credentials: &OAuthCredentials,
    ) -> Result<(), AuthError> {
        self.auth_method_service
            .create_oauth_auth(
                user.id,
                credentials.provider,
                &credentials.provider_id,
                credentials.access_token.as_deref(),
                credentials.refresh_token.as_deref(),
                credentials.expires_at,
                true,
            )
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests will be added in next phase
}
