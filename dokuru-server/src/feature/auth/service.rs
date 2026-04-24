use std::sync::Arc;

use axum_extra::extract::cookie::Cookie;

use super::{
    auth_method::AuthMethodService,
    credentials::{LoginCredentials, OAuthCredentials, RegisterData},
    oauth_service::OAuthService,
    password_auth_service::PasswordAuthService,
    repository::AuthError,
    session::SessionService,
    token_service::TokenService,
    types::{AuthResponse, TokenResponse, UserResponse},
};
use crate::{
    feature::user::{UserProfileRepository, repository::UserRepository},
    infrastructure::{
        config::Config,
        persistence::{Database, redis_trait::SessionBlacklist},
    },
};

/// Facade for authentication operations
#[derive(Clone)]
pub struct AuthService {
    db: Database,
    user_repo: Arc<dyn UserRepository>,
    profile_repo: Arc<dyn UserProfileRepository>,
    password_auth: PasswordAuthService,
    oauth_auth: OAuthService,
    token_service: TokenService,
}

impl AuthService {
    #[must_use]
    pub fn new(
        db: Database,
        user_repo: Arc<dyn UserRepository>,
        profile_repo: Arc<dyn UserProfileRepository>,
        auth_method_service: AuthMethodService,
        config: Arc<Config>,
        session_blacklist: Option<Arc<dyn SessionBlacklist>>,
        session_service: SessionService,
    ) -> Self {
        let password_auth = PasswordAuthService::new(
            db.clone(),
            Arc::clone(&user_repo),
            auth_method_service.clone(),
        );

        let oauth_auth = OAuthService::new(
            db.clone(),
            Arc::clone(&user_repo),
            Arc::clone(&profile_repo),
            auth_method_service,
        );

        let token_service = TokenService::new(
            db.clone(),
            Arc::clone(&user_repo),
            config,
            session_blacklist,
            session_service,
        );

        Self {
            db,
            user_repo,
            profile_repo,
            password_auth,
            oauth_auth,
            token_service,
        }
    }

    /// Register new user with password
    ///
    /// # Errors
    ///
    /// Returns `AuthError` if email/username exists, password hashing fails, or database error occurs.
    pub async fn register(
        &self,
        data: RegisterData,
    ) -> Result<(AuthResponse, Cookie<'static>), AuthError> {
        let user = self.create_user(&data).await?;
        self.create_profile(&user.id, data.full_name.as_deref())
            .await?;
        self.create_password_auth(&user.id, &data.password).await?;

        let tokens = self.token_service.create_tokens(&user)?;

        if let Some(device_info) = &data.device_info {
            self.token_service
                .create_session(user.id, &tokens.session_id, device_info, &tokens)
                .await?;
        }

        let response = self
            .build_auth_response(&user, &tokens, data.full_name.as_deref())
            .await?;
        let cookie = self
            .token_service
            .create_refresh_cookie(&tokens.refresh_token);

        Ok((response, cookie))
    }

    /// Login user with password
    ///
    /// # Errors
    ///
    /// Returns `AuthError` if credentials invalid or user inactive
    pub async fn login(
        &self,
        credentials: LoginCredentials,
    ) -> Result<(AuthResponse, Cookie<'static>), AuthError> {
        let user = self.password_auth.authenticate(&credentials).await?;
        let tokens = self.token_service.create_tokens(&user)?;

        if let Some(device_info) = &credentials.device_info {
            self.token_service
                .create_session(user.id, &tokens.session_id, device_info, &tokens)
                .await?;
        }

        let response = self.build_auth_response(&user, &tokens, None).await?;
        let cookie = self
            .token_service
            .create_refresh_cookie(&tokens.refresh_token);

        Ok((response, cookie))
    }

    /// OAuth login/register
    ///
    /// # Errors
    ///
    /// Returns `AuthError` if OAuth flow fails
    pub async fn oauth_login(
        &self,
        credentials: OAuthCredentials,
    ) -> Result<(AuthResponse, Cookie<'static>), AuthError> {
        let user = self
            .oauth_auth
            .authenticate_or_register(&credentials)
            .await?;
        let tokens = self.token_service.create_tokens(&user)?;

        let response = self
            .build_auth_response(&user, &tokens, credentials.name.as_deref())
            .await?;
        let cookie = self
            .token_service
            .create_refresh_cookie(&tokens.refresh_token);

        Ok((response, cookie))
    }

    /// Refresh access token with rotation
    ///
    /// # Errors
    ///
    /// Returns `AuthError` if token invalid or expired
    pub async fn refresh_token(
        &self,
        refresh_token: &str,
    ) -> Result<(TokenResponse, Cookie<'static>), AuthError> {
        self.token_service.refresh_token(refresh_token).await
    }

    /// Logout
    #[must_use]
    pub async fn logout(
        &self,
        refresh_token: Option<&str>,
        access_token: Option<&str>,
    ) -> Cookie<'static> {
        self.token_service.logout(refresh_token, access_token).await
    }

    /// Get user with profile
    ///
    /// # Errors
    ///
    /// Returns `sqlx::Error` if database query fails
    pub async fn get_user_with_profile(
        &self,
        user_id: uuid::Uuid,
    ) -> Result<Option<crate::feature::user::UserWithProfile>, sqlx::Error> {
        self.profile_repo
            .get_user_with_profile(self.db.pool(), user_id)
            .await
    }

    /// Get session service
    #[must_use]
    pub const fn session_service(&self) -> &SessionService {
        self.token_service.session_service()
    }

    /// Get auth method service (for admin operations)
    #[must_use]
    pub const fn auth_method_service(&self) -> &AuthMethodService {
        self.password_auth.auth_method_service()
    }

    // Private helper methods

    async fn create_user(
        &self,
        data: &RegisterData,
    ) -> Result<crate::feature::user::User, AuthError> {
        use crate::feature::user::repository::UserRepositoryError;

        self.user_repo
            .create(self.db.pool(), &data.email, data.username.as_deref())
            .await
            .map_err(|e| match e {
                UserRepositoryError::EmailExists => AuthError::EmailExists,
                UserRepositoryError::UsernameExists => AuthError::UsernameExists,
                _ => AuthError::Database(sqlx::Error::RowNotFound),
            })
    }

    async fn create_profile(
        &self,
        user_id: &uuid::Uuid,
        full_name: Option<&str>,
    ) -> Result<(), AuthError> {
        self.profile_repo
            .create(self.db.pool(), *user_id)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        if let Some(name) = full_name {
            let _ = self
                .profile_repo
                .update(self.db.pool(), *user_id, Some(name), None, None, None)
                .await;
        }

        Ok(())
    }

    async fn create_password_auth(
        &self,
        user_id: &uuid::Uuid,
        password: &str,
    ) -> Result<(), AuthError> {
        self.password_auth
            .auth_method_service()
            .create_password_auth(*user_id, password, true)
            .await
            .map_err(|_| AuthError::HashError)?;
        Ok(())
    }

    async fn build_auth_response(
        &self,
        user: &crate::feature::user::User,
        tokens: &super::token_service::TokenPair,
        override_name: Option<&str>,
    ) -> Result<AuthResponse, AuthError> {
        let profile = self
            .profile_repo
            .find_by_user_id(self.db.pool(), user.id)
            .await
            .ok()
            .flatten();

        let name = override_name
            .map(ToString::to_string)
            .or_else(|| profile.as_ref().and_then(|p| p.full_name.clone()))
            .unwrap_or_default();

        Ok(AuthResponse {
            user: UserResponse {
                id: user.id,
                email: user.email.clone(),
                username: user.username.clone(),
                name,
                avatar_url: profile.as_ref().and_then(|p| p.avatar_url.clone()),
                role: user.role().to_string(),
            },
            token: TokenResponse {
                access_token: tokens.access_token.clone(),
                expires_in: tokens.expires_in,
            },
        })
    }
}
