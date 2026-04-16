use std::sync::Arc;

use axum_extra::extract::cookie::Cookie;

use crate::{
    feature::{
        auth::{
            auth_method::{AuthMethodService, AuthProvider},
            repository::AuthError,
            session::{DeviceInfo, SessionService},
            types::{AuthResponse, TokenResponse, UserResponse},
            utils::{
                create_cleared_cookie, create_refresh_cookie, create_token_pair, extract_user_id,
                validate_refresh_token,
            },
        },
        user::{UserProfileRepository, repository::UserRepository},
    },
    infrastructure::{
        config::Config,
        persistence::{Database, redis_trait::SessionBlacklist},
    },
};

/// Auth service with JWT, session management, and OAuth support
#[derive(Clone)]
pub struct AuthService {
    db: Database,
    user_repo: Arc<dyn UserRepository>,
    profile_repo: Arc<dyn UserProfileRepository>,
    auth_method_service: AuthMethodService,
    config: Arc<Config>,
    session_blacklist: Option<Arc<dyn SessionBlacklist>>,
    session_service: SessionService,
}

impl AuthService {
    pub fn new(
        db: Database,
        user_repo: Arc<dyn UserRepository>,
        profile_repo: Arc<dyn UserProfileRepository>,
        auth_method_service: AuthMethodService,
        config: Arc<Config>,
        session_blacklist: Option<Arc<dyn SessionBlacklist>>,
        session_service: SessionService,
    ) -> Self {
        Self {
            db,
            user_repo,
            profile_repo,
            auth_method_service,
            config,
            session_blacklist,
            session_service,
        }
    }

    /// Register new user with password
    pub async fn register(
        &self,
        email: &str,
        username: Option<&str>,
        password: &str,
        full_name: Option<&str>,
        device_info: Option<&DeviceInfo>,
    ) -> Result<(AuthResponse, Cookie<'static>), AuthError> {
        // 1. Create user (identity only)
        let user = self
            .user_repo
            .create(self.db.pool(), email, username)
            .await
            .map_err(|e| match e {
                crate::feature::user::repository::UserRepositoryError::EmailExists => {
                    AuthError::EmailExists
                }
                crate::feature::user::repository::UserRepositoryError::UsernameExists => {
                    AuthError::UsernameExists
                }
                _ => AuthError::Database(sqlx::Error::RowNotFound),
            })?;

        // 2. Create profile
        let _profile = self
            .profile_repo
            .create(self.db.pool(), user.id)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        // 3. Create password auth method
        let _auth_method = self
            .auth_method_service
            .create_password_auth(user.id, password, true)
            .await
            .map_err(|_| AuthError::HashError)?;

        // 4. Update profile with full name if provided
        if let Some(name) = full_name {
            let _ = self
                .profile_repo
                .update(self.db.pool(), user.id, Some(name), None, None, None)
                .await;
        }

        // 5. Generate tokens
        let roles = vec![user.role()];
        let tokens =
            create_token_pair(user.id, &user.email, &roles).map_err(|_| AuthError::HashError)?;

        // 6. Create session record
        if let Some(info) = device_info {
            let refresh_expiry: i64 = std::env::var("JWT_REFRESH_EXPIRY_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(604800); // default 7 days

            let expires_at =
                chrono::DateTime::from_timestamp(tokens.session_iat + refresh_expiry, 0)
                    .unwrap_or_else(|| chrono::Utc::now() + chrono::Duration::days(7));

            let _ = self
                .session_service
                .create_session(user.id, &tokens.session_id, info, expires_at)
                .await;
        }

        let refresh_cookie = create_refresh_cookie(&tokens.refresh_token, &self.config);

        let username = user.username.clone();
        let role = user.role().to_string();

        let response = AuthResponse {
            user: UserResponse {
                id: user.id,
                email: user.email,
                username,
                name: full_name.map(|s| s.to_string()).unwrap_or_default(),
                avatar_url: None,
                role,
            },
            token: TokenResponse {
                access_token: tokens.access_token,
                expires_in: tokens.expires_in,
            },
        };

        Ok((response, refresh_cookie))
    }

    /// Login user with password
    pub async fn login(
        &self,
        identifier: &str,
        password: &str,
        device_info: Option<&DeviceInfo>,
    ) -> Result<(AuthResponse, Cookie<'static>), AuthError> {
        // 1. Find user by email or username
        let user = match self
            .user_repo
            .find_by_email(self.db.pool(), identifier)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
        {
            Some(user) => user,
            None => {
                // Try username if email not found
                self.user_repo
                    .find_by_username(self.db.pool(), identifier)
                    .await
                    .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
                    .ok_or(AuthError::InvalidCredentials)?
            }
        };

        if !user.is_active {
            return Err(AuthError::InvalidCredentials);
        }

        // 2. Find password auth method
        let auth_method = self
            .auth_method_service
            .find_by_user_and_provider(user.id, AuthProvider::Password)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
            .ok_or(AuthError::InvalidCredentials)?;

        // 3. Verify password
        if !auth_method
            .verify_password(password)
            .map_err(|_| AuthError::HashError)?
        {
            return Err(AuthError::InvalidCredentials);
        }

        // 4. Update last used (fire and forget)
        let _ = self.auth_method_service.touch(auth_method.id).await;

        // 5. Get profile for response
        let profile = self
            .profile_repo
            .find_by_user_id(self.db.pool(), user.id)
            .await
            .ok()
            .flatten();

        // 6. Generate tokens
        let roles = vec![user.role()];
        let tokens =
            create_token_pair(user.id, &user.email, &roles).map_err(|_| AuthError::HashError)?;

        // 7. Create session record
        if let Some(info) = device_info {
            tracing::info!(
                "Creating session for user: {}, device: {:?}",
                user.id,
                info.device_type
            );
            let refresh_expiry: i64 = std::env::var("JWT_REFRESH_EXPIRY_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(604800); // default 7 days

            let expires_at =
                chrono::DateTime::from_timestamp(tokens.session_iat + refresh_expiry, 0)
                    .unwrap_or_else(|| chrono::Utc::now() + chrono::Duration::days(7));

            match self
                .session_service
                .create_session(user.id, &tokens.session_id, info, expires_at)
                .await
            {
                Ok(session) => tracing::info!("Session created successfully: {:?}", session.id),
                Err(e) => tracing::error!("Failed to create session: {:?}", e),
            }
        } else {
            tracing::warn!("No device info provided, skipping session creation");
        }

        let refresh_cookie = create_refresh_cookie(&tokens.refresh_token, &self.config);

        let username = user.username.clone();
        let role = user.role().to_string();

        let response = AuthResponse {
            user: UserResponse {
                id: user.id,
                email: user.email,
                username,
                name: profile
                    .as_ref()
                    .and_then(|p| p.full_name.clone())
                    .unwrap_or_default(),
                avatar_url: profile.as_ref().and_then(|p| p.avatar_url.clone()),
                role,
            },
            token: TokenResponse {
                access_token: tokens.access_token,
                expires_in: tokens.expires_in,
            },
        };

        Ok((response, refresh_cookie))
    }

    /// OAuth login/register
    #[allow(clippy::too_many_arguments)]
    pub async fn oauth_login(
        &self,
        provider: AuthProvider,
        provider_id: &str,
        email: &str,
        name: Option<&str>,
        access_token: Option<&str>,
        refresh_token: Option<&str>,
        expires_at: Option<chrono::DateTime<chrono::Utc>>,
        _device_info: Option<&DeviceInfo>,
    ) -> Result<(AuthResponse, Cookie<'static>), AuthError> {
        // 1. Check if OAuth account exists
        if let Some(auth_method) = self
            .auth_method_service
            .find_by_provider_id(provider, provider_id)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
        {
            // Existing OAuth user - login
            let user = self
                .user_repo
                .find_by_id(self.db.pool(), auth_method.user_id)
                .await
                .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
                .ok_or(AuthError::InvalidCredentials)?;

            // Generate tokens
            let roles = vec![user.role()];
            let tokens = create_token_pair(user.id, &user.email, &roles)
                .map_err(|_| AuthError::HashError)?;

            let refresh_cookie = create_refresh_cookie(&tokens.refresh_token, &self.config);

            let profile = self
                .profile_repo
                .find_by_user_id(self.db.pool(), user.id)
                .await
                .ok()
                .flatten();

            let username = user.username.clone();
            let role = user.role().to_string();

            let response = AuthResponse {
                user: UserResponse {
                    id: user.id,
                    email: user.email,
                    username,
                    name: profile
                        .as_ref()
                        .and_then(|p| p.full_name.clone())
                        .unwrap_or_default(),
                    avatar_url: profile.as_ref().and_then(|p| p.avatar_url.clone()),
                    role,
                },
                token: TokenResponse {
                    access_token: tokens.access_token,
                    expires_in: tokens.expires_in,
                },
            };

            return Ok((response, refresh_cookie));
        }

        // 2. Check if email exists - link to existing account
        if let Some(user) = self
            .user_repo
            .find_by_email(self.db.pool(), email)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
        {
            // Link OAuth to existing user
            let _ = self
                .auth_method_service
                .create_oauth_auth(
                    user.id,
                    provider,
                    provider_id,
                    access_token,
                    refresh_token,
                    expires_at,
                    false, // Not primary
                )
                .await
                .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

            // Generate tokens
            let roles = vec![user.role()];
            let tokens = create_token_pair(user.id, &user.email, &roles)
                .map_err(|_| AuthError::HashError)?;

            let refresh_cookie = create_refresh_cookie(&tokens.refresh_token, &self.config);

            let profile = self
                .profile_repo
                .find_by_user_id(self.db.pool(), user.id)
                .await
                .ok()
                .flatten();

            let username = user.username.clone();
            let role = user.role().to_string();

            let response = AuthResponse {
                user: UserResponse {
                    id: user.id,
                    email: user.email,
                    username,
                    name: profile
                        .as_ref()
                        .and_then(|p| p.full_name.clone())
                        .unwrap_or_default(),
                    avatar_url: profile.as_ref().and_then(|p| p.avatar_url.clone()),
                    role,
                },
                token: TokenResponse {
                    access_token: tokens.access_token,
                    expires_in: tokens.expires_in,
                },
            };

            return Ok((response, refresh_cookie));
        }

        // 3. Create new user with OAuth
        let user = self
            .user_repo
            .create(self.db.pool(), email, None)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        // 4. Create profile
        let _profile = self
            .profile_repo
            .create(self.db.pool(), user.id)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        if let Some(n) = name {
            let _ = self
                .profile_repo
                .update(self.db.pool(), user.id, Some(n), None, None, None)
                .await;
        }

        // 5. Create OAuth auth method
        let _ = self
            .auth_method_service
            .create_oauth_auth(
                user.id,
                provider,
                provider_id,
                access_token,
                refresh_token,
                expires_at,
                true, // Primary for OAuth-only users
            )
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        // 6. Generate tokens
        let roles = vec![user.role()];
        let tokens =
            create_token_pair(user.id, &user.email, &roles).map_err(|_| AuthError::HashError)?;

        let refresh_cookie = create_refresh_cookie(&tokens.refresh_token, &self.config);

        let username = user.username.clone();
        let role = user.role().to_string();

        let response = AuthResponse {
            user: UserResponse {
                id: user.id,
                email: user.email,
                username,
                name: name.map(|s| s.to_string()).unwrap_or_default(),
                avatar_url: None,
                role,
            },
            token: TokenResponse {
                access_token: tokens.access_token,
                expires_in: tokens.expires_in,
            },
        };

        Ok((response, refresh_cookie))
    }

    /// Refresh access token with rotation
    pub async fn refresh_token(
        &self,
        refresh_token: &str,
    ) -> Result<(TokenResponse, Cookie<'static>), AuthError> {
        let claims = validate_refresh_token(refresh_token).map_err(|e| match e {
            crate::feature::auth::utils::JwtError::SessionExpired => AuthError::SessionExpired,
            _ => AuthError::InvalidCredentials,
        })?;

        let user_id = extract_user_id(&claims).map_err(|_| AuthError::InvalidCredentials)?;

        // Check blacklist
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

        // Check if session is still active in database
        let session = self
            .session_service
            .get_session(&claims.sid)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?;

        if let Some(s) = session {
            if !s.is_active {
                tracing::warn!("Session {} has been revoked", claims.sid);
                return Err(AuthError::InvalidCredentials);
            }
        } else {
            tracing::warn!("Session {} not found in database", claims.sid);
            return Err(AuthError::InvalidCredentials);
        }

        // Update session last active
        let _ = self.session_service.touch_session(&claims.sid).await;

        let user = self
            .user_repo
            .find_by_id(self.db.pool(), user_id)
            .await
            .map_err(|_| AuthError::Database(sqlx::Error::RowNotFound))?
            .ok_or(AuthError::InvalidCredentials)?;

        // Blacklist old token
        if let Some(ref blacklist) = self.session_blacklist {
            let _ = blacklist.blacklist_session(&claims.jti, claims.exp).await;
        }

        // Generate new tokens with same session
        let roles = vec![user.role()];
        let tokens = crate::feature::auth::utils::jwt::create_token_pair_with_session(
            user.id,
            &user.email,
            &roles,
            &claims.sid,
            claims.s_iat,
        )
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

    /// Logout
    pub async fn logout(
        &self,
        refresh_token: Option<&str>,
        access_token: Option<&str>,
    ) -> Cookie<'static> {
        // Blacklist tokens if provided and revoke session in DB
        if let (Some(token), Some(blacklist)) = (refresh_token, self.session_blacklist.as_ref())
            && let Ok(claims) = validate_refresh_token(token)
        {
            let _ = blacklist.blacklist_session(&claims.jti, claims.exp).await;
            // Revoke session in database
            let _ = self
                .session_service
                .revoke_by_session_id(&claims.sid, "user_logout")
                .await;
        }

        if let (Some(token), Some(blacklist)) = (access_token, self.session_blacklist.as_ref())
            && let Ok(claims) = crate::feature::auth::utils::validate_access_token(token)
        {
            let _ = blacklist.blacklist_session(&claims.jti, claims.exp).await;
        }

        create_cleared_cookie(&self.config)
    }

    /// Get user with profile
    pub async fn get_user_with_profile(
        &self,
        user_id: uuid::Uuid,
    ) -> Result<Option<crate::feature::user::UserWithProfile>, sqlx::Error> {
        self.profile_repo
            .get_user_with_profile(self.db.pool(), user_id)
            .await
    }

    /// Get auth method service
    pub fn auth_method_service(&self) -> &AuthMethodService {
        &self.auth_method_service
    }

    /// Get session service
    pub fn session_service(&self) -> &SessionService {
        &self.session_service
    }
}
