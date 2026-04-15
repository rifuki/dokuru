use std::sync::Arc;

use crate::{
    feature::{
        auth::{
            cookie::{create_cleared_cookie, create_refresh_cookie},
            dto::{AuthResponse, LoginCredentials, TokenResponse, UserResponse},
            jwt,
            repository::AuthError,
        },
        user::{CreateUser, repository::UserRepository},
    },
    infrastructure::{config::Config, persistence::Database},
};
use axum_extra::extract::cookie::Cookie;

/// Auth service with JWT
#[derive(Clone)]
pub struct AuthService {
    db: Database,
    user_repo: Arc<dyn UserRepository>,
    config: Arc<Config>,
}

impl AuthService {
    pub fn new(db: Database, user_repo: Arc<dyn UserRepository>, config: Arc<Config>) -> Self {
        Self {
            db,
            user_repo,
            config,
        }
    }

    /// Register new user — returns tokens + refresh token cookie
    pub async fn register(
        &self,
        req: CreateUser,
    ) -> Result<(AuthResponse, Cookie<'static>), AuthError> {
        let user = self.user_repo.create(self.db.pool(), &req).await?;

        let roles = vec![user.role()];
        let tokens = jwt::create_token_pair(user.id, &user.email, &roles)
            .map_err(|_| AuthError::HashError)?;

        let refresh_cookie = create_refresh_cookie(&tokens.refresh_token, &self.config);

        let user_role = user.role().to_string();
        let response = AuthResponse {
            user: UserResponse {
                id: user.id,
                email: user.email.clone(),
                username: user.username.clone(),
                name: user.name.clone(),
                role: user_role,
            },
            token: TokenResponse {
                access_token: tokens.access_token,
                expires_in: tokens.expires_in,
            },
        };

        Ok((response, refresh_cookie))
    }

    /// Login — returns tokens + refresh token cookie
    pub async fn login(
        &self,
        req: LoginCredentials,
    ) -> Result<(AuthResponse, Cookie<'static>), AuthError> {
        let user = self
            .user_repo
            .find_by_email(self.db.pool(), &req.email)
            .await?
            .ok_or(AuthError::InvalidCredentials)?;

        let valid = user
            .verify_password(&req.password)
            .map_err(|_| AuthError::HashError)?;

        if !valid {
            return Err(AuthError::InvalidCredentials);
        }

        let roles = vec![user.role()];
        let tokens = jwt::create_token_pair(user.id, &user.email, &roles)
            .map_err(|_| AuthError::HashError)?;

        let refresh_cookie = create_refresh_cookie(&tokens.refresh_token, &self.config);

        let user_role = user.role().to_string();
        let response = AuthResponse {
            user: UserResponse {
                id: user.id,
                email: user.email.clone(),
                username: user.username.clone(),
                name: user.name.clone(),
                role: user_role,
            },
            token: TokenResponse {
                access_token: tokens.access_token,
                expires_in: tokens.expires_in,
            },
        };

        Ok((response, refresh_cookie))
    }

    /// Refresh access token — reads refresh token from caller, returns new tokens + new cookie
    pub async fn refresh_token(
        &self,
        refresh_token: &str,
    ) -> Result<(TokenResponse, Cookie<'static>), AuthError> {
        let claims = jwt::validate_refresh_token(refresh_token)
            .map_err(|_| AuthError::InvalidCredentials)?;

        let user_id = jwt::extract_user_id(&claims).map_err(|_| AuthError::InvalidCredentials)?;

        let user = self
            .user_repo
            .find_by_id(self.db.pool(), user_id)
            .await?
            .ok_or(AuthError::InvalidCredentials)?;

        // Re-read role from DB so role changes take effect at next refresh
        let roles = vec![user.role()];
        let tokens = jwt::create_token_pair(user.id, &user.email, &roles)
            .map_err(|_| AuthError::HashError)?;

        let refresh_cookie = create_refresh_cookie(&tokens.refresh_token, &self.config);

        Ok((
            TokenResponse {
                access_token: tokens.access_token,
                expires_in: tokens.expires_in,
            },
            refresh_cookie,
        ))
    }

    /// Logout — clears refresh token cookie
    /// Note: JWT access tokens are stateless, they expire naturally
    pub fn logout(&self) -> Cookie<'static> {
        create_cleared_cookie(&self.config)
    }
}

impl std::fmt::Debug for AuthService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthService")
            .field("db", &"<Database>")
            .finish()
    }
}
