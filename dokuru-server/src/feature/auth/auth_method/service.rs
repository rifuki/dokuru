use std::sync::Arc;

use crate::{
    feature::auth::auth_method::{
        entity::{AuthMethod, AuthProvider, CreateOAuthAuth, CreatePasswordAuth},
        repository::{AuthMethodRepository, AuthMethodRepositoryError},
    },
    feature::auth::domain,
    infrastructure::persistence::Database,
};

pub struct CreateOAuthAuthInput<'a> {
    pub user_id: uuid::Uuid,
    pub provider: AuthProvider,
    pub provider_id: &'a str,
    pub access_token: Option<&'a str>,
    pub refresh_token: Option<&'a str>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub is_primary: bool,
}

#[derive(Clone)]
pub struct AuthMethodService {
    db: Database,
    repo: Arc<dyn AuthMethodRepository>,
}

impl AuthMethodService {
    pub fn new(db: Database, repo: Arc<dyn AuthMethodRepository>) -> Self {
        Self { db, repo }
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn create_password_auth(
        &self,
        user_id: uuid::Uuid,
        password: &str,
        is_primary: bool,
    ) -> Result<AuthMethod, AuthMethodRepositoryError> {
        let password_hash = hash_password(password)
            .map_err(|_| AuthMethodRepositoryError::Database(sqlx::Error::RowNotFound))?;

        self.repo
            .create_password(
                self.db.pool(),
                CreatePasswordAuth {
                    user_id,
                    password_hash,
                    is_primary,
                },
            )
            .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn create_oauth_auth(
        &self,
        input: CreateOAuthAuthInput<'_>,
    ) -> Result<AuthMethod, AuthMethodRepositoryError> {
        self.repo
            .create_oauth(
                self.db.pool(),
                CreateOAuthAuth {
                    user_id: input.user_id,
                    provider: input.provider,
                    provider_id: input.provider_id.to_string(),
                    access_token: input.access_token.map(std::string::ToString::to_string),
                    refresh_token: input.refresh_token.map(std::string::ToString::to_string),
                    expires_at: input.expires_at,
                    is_primary: input.is_primary,
                },
            )
            .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn find_by_id(&self, id: uuid::Uuid) -> Result<Option<AuthMethod>, sqlx::Error> {
        self.repo.find_by_id(self.db.pool(), id).await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn find_by_provider_id(
        &self,
        provider: AuthProvider,
        provider_id: &str,
    ) -> Result<Option<AuthMethod>, sqlx::Error> {
        self.repo
            .find_by_provider_id(self.db.pool(), provider.as_str(), provider_id)
            .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn find_by_user_and_provider(
        &self,
        user_id: uuid::Uuid,
        provider: AuthProvider,
    ) -> Result<Option<AuthMethod>, sqlx::Error> {
        self.repo
            .find_by_user_and_provider(self.db.pool(), user_id, provider.as_str())
            .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn list_by_user(&self, user_id: uuid::Uuid) -> Result<Vec<AuthMethod>, sqlx::Error> {
        self.repo.list_by_user(self.db.pool(), user_id).await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn find_primary(
        &self,
        user_id: uuid::Uuid,
    ) -> Result<Option<AuthMethod>, sqlx::Error> {
        self.repo.find_primary(self.db.pool(), user_id).await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn update_password(
        &self,
        auth_method_id: uuid::Uuid,
        new_password: &str,
    ) -> Result<bool, sqlx::Error> {
        let password_hash = hash_password(new_password).map_err(|_| sqlx::Error::RowNotFound)?;
        self.repo
            .update_password(self.db.pool(), auth_method_id, &password_hash)
            .await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn delete(&self, auth_method_id: uuid::Uuid) -> Result<bool, sqlx::Error> {
        self.repo.delete(self.db.pool(), auth_method_id).await
    }

    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub async fn touch(&self, auth_method_id: uuid::Uuid) -> Result<(), sqlx::Error> {
        self.repo.touch(self.db.pool(), auth_method_id).await
    }
}

fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    domain::hash_password(password).map_err(|_| argon2::password_hash::Error::Password)
}
