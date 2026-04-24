use std::sync::Arc;

use axum_extra::extract::cookie::Cookie;
use uuid::Uuid;

use super::{
    repository::AuthError,
    session::{DeviceInfo, SessionService},
    types::TokenResponse,
    utils::{
        create_cleared_cookie, create_refresh_cookie, create_token_pair, extract_user_id,
        validate_refresh_token,
    },
};
use crate::{
    feature::user::{User, repository::UserRepository},
    infrastructure::{
        config::Config,
        persistence::{Database, redis_trait::SessionBlacklist},
    },
};

/// Token pair with session metadata
#[derive(Debug)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub session_id: String,
    pub session_iat: i64,
}

/// Service for JWT token management
#[derive(Clone)]
pub struct TokenService {
    db: Database,
    user_repo: Arc<dyn UserRepository>,
    config: Arc<Config>,
    session_blacklist: Option<Arc<dyn SessionBlacklist>>,
    session_service: SessionService,
}

impl TokenService {
    #[must_use]
    pub fn new(
        db: Database,
        user_repo: Arc<dyn UserRepository>,
        config: Arc<Config>,
        session_blacklist: Option<Arc<dyn SessionBlacklist>>,
        session_service: SessionService,
    ) -> Self {
        Self {
            db,
            user_repo,
            config,
            session_blacklist,
            session_service,
        }
    }

    /// Create token pair for user
    ///
    /// # Errors
    ///
    /// Returns `AuthError` if token generation fails
    pub fn create_tokens(&self, user: &User) -> Result<TokenPair, AuthError> {
        let roles = vec![user.role()];
        let tokens =
            create_token_pair(user.id, &user.email, &roles).map_err(|_| AuthError::HashError)?;

        Ok(TokenPair {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            session_id: tokens.session_id,
            session_iat: tokens.session_iat,
        })
    }

    /// Create session record
    pub async fn create_session(
        &self,
        user_id: Uuid,
        session_id: &str,
        device_info: &DeviceInfo,
        tokens: &TokenPair,
    ) -> Result<(), AuthError> {
        let refresh_expiry = self.config.auth.refresh_expiry_secs;
        let expires_at = chrono::DateTime::from_timestamp(tokens.session_iat + refresh_expiry, 0)
            .unwrap_or_else(|| chrono::Utc::now() + chrono::Duration::days(7));

        self.session_service
            .create_session(user_id, session_id, device_info, expires_at)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        Ok(())
    }

    /// Refresh access token with rotation
    ///
    /// # Errors
    ///
    /// Returns `AuthError` if token invalid, expired, or blacklisted
    pub async fn refresh_token(
        &self,
        refresh_token: &str,
    ) -> Result<(TokenResponse, Cookie<'static>), AuthError> {
        let claims = self.validate_and_check_blacklist(refresh_token).await?;
        let user_id = extract_user_id(&claims).map_err(|_| AuthError::InvalidCredentials)?;

        self.verify_session_active(&claims.sid).await?;
        self.touch_session(&claims.sid).await;

        let user = self.fetch_user(user_id).await?;
        self.blacklist_old_token(&claims).await;

        let tokens = Self::generate_new_tokens(&user, &claims)?;
        let refresh_cookie = create_refresh_cookie(&tokens.refresh_token, &self.config);

        Ok((
            TokenResponse {
                access_token: tokens.access_token,
                expires_in: tokens.expires_in,
            },
            refresh_cookie,
        ))
    }

    async fn validate_and_check_blacklist(
        &self,
        token: &str,
    ) -> Result<super::types::Claims, AuthError> {
        let claims = validate_refresh_token(token).map_err(|e| match e {
            super::utils::JwtError::SessionExpired => AuthError::SessionExpired,
            _ => AuthError::InvalidCredentials,
        })?;

        if let Some(ref blacklist) = self.session_blacklist {
            let is_blacklisted = blacklist
                .is_blacklisted(&claims.jti)
                .await
                .map_err(|_| AuthError::InvalidCredentials)?;

            if is_blacklisted {
                tracing::warn!("Token reuse detected for session: {}", claims.sid);
                return Err(AuthError::InvalidCredentials);
            }
        }

        Ok(claims)
    }

    async fn verify_session_active(&self, session_id: &str) -> Result<(), AuthError> {
        let session = self
            .session_service
            .get_session(session_id)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        match session {
            Some(s) if s.is_active => Ok(()),
            Some(_) => {
                tracing::warn!("Session {} has been revoked", session_id);
                Err(AuthError::InvalidCredentials)
            }
            None => {
                tracing::warn!("Session {} not found in database", session_id);
                Err(AuthError::InvalidCredentials)
            }
        }
    }

    async fn touch_session(&self, session_id: &str) {
        let _ = self.session_service.touch_session(session_id).await;
    }

    async fn fetch_user(&self, user_id: Uuid) -> Result<User, AuthError> {
        self.user_repo
            .find_by_id(self.db.pool(), user_id)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
            .ok_or(AuthError::InvalidCredentials)
    }

    async fn blacklist_old_token(&self, claims: &super::types::Claims) {
        if let Some(ref blacklist) = self.session_blacklist {
            let _ = blacklist.blacklist_session(&claims.jti, claims.exp).await;
        }
    }

    fn generate_new_tokens(
        user: &User,
        claims: &super::types::Claims,
    ) -> Result<TokenPair, AuthError> {
        let roles = vec![user.role()];
        let tokens = super::utils::jwt::create_token_pair_with_session(
            user.id,
            &user.email,
            &roles,
            &claims.sid,
            claims.s_iat,
        )
        .map_err(|_| AuthError::HashError)?;

        Ok(TokenPair {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            session_id: tokens.session_id,
            session_iat: tokens.session_iat,
        })
    }

    /// Logout and blacklist tokens
    pub async fn logout(
        &self,
        refresh_token: Option<&str>,
        access_token: Option<&str>,
    ) -> Cookie<'static> {
        if let (Some(token), Some(blacklist)) = (refresh_token, self.session_blacklist.as_ref())
            && let Ok(claims) = validate_refresh_token(token)
        {
            let _ = blacklist.blacklist_session(&claims.jti, claims.exp).await;
            let _ = self
                .session_service
                .revoke_by_session_id(&claims.sid, "user_logout")
                .await;
        }

        if let (Some(token), Some(blacklist)) = (access_token, self.session_blacklist.as_ref())
            && let Ok(claims) = super::utils::validate_access_token(token)
        {
            let _ = blacklist.blacklist_session(&claims.jti, claims.exp).await;
        }

        create_cleared_cookie(&self.config)
    }

    /// Create refresh cookie
    #[must_use]
    pub fn create_refresh_cookie(&self, refresh_token: &str) -> Cookie<'static> {
        create_refresh_cookie(refresh_token, &self.config)
    }

    /// Get session service reference
    #[must_use]
    pub const fn session_service(&self) -> &SessionService {
        &self.session_service
    }
}

#[cfg(test)]
mod tests {

    // Tests will be added in next phase
}
