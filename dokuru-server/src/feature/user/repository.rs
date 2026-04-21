use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use crate::feature::user::entity::{User, UserProfile, UserWithProfile};

/// User repository errors (data-layer, not auth-layer)
#[derive(Debug, thiserror::Error)]
pub enum UserRepositoryError {
    #[error("Email already exists")]
    EmailExists,

    #[error("Username already exists")]
    UsernameExists,

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("User not found")]
    NotFound,
}

/// User repository trait — usable by any feature (auth, profile, admin, etc.)
#[async_trait]
pub trait UserRepository: Send + Sync {
    /// Create new user (identity only)
    async fn create(
        &self,
        pool: &PgPool,
        email: &str,
        username: Option<&str>,
    ) -> Result<User, UserRepositoryError>;

    /// Find user by ID
    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<User>, sqlx::Error>;

    /// Find user by email
    async fn find_by_email(&self, pool: &PgPool, email: &str) -> Result<Option<User>, sqlx::Error>;

    /// Find user by username
    async fn find_by_username(
        &self,
        pool: &PgPool,
        username: &str,
    ) -> Result<Option<User>, sqlx::Error>;

    /// List all users
    async fn list(&self, pool: &PgPool, limit: i64, offset: i64) -> Result<Vec<User>, sqlx::Error>;

    /// Update user identity
    async fn update(
        &self,
        pool: &PgPool,
        id: Uuid,
        email: Option<&str>,
        username: Option<&str>,
    ) -> Result<Option<User>, sqlx::Error>;

    /// Delete user (cascades to profiles, auth_methods, sessions)
    async fn delete(&self, pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error>;

    /// Check if email exists
    async fn exists_by_email(&self, pool: &PgPool, email: &str) -> Result<bool, sqlx::Error>;

    /// Check if username exists
    async fn exists_by_username(&self, pool: &PgPool, username: &str) -> Result<bool, sqlx::Error>;

    /// Update user role
    async fn update_role(
        &self,
        pool: &PgPool,
        id: Uuid,
        role: &str,
    ) -> Result<Option<User>, sqlx::Error>;

    /// Update email verification status
    async fn set_email_verified(
        &self,
        pool: &PgPool,
        id: Uuid,
        verified: bool,
    ) -> Result<bool, sqlx::Error>;

    /// Activate/deactivate user
    async fn set_active(&self, pool: &PgPool, id: Uuid, active: bool) -> Result<bool, sqlx::Error>;

    /// Find user with profile
    async fn find_with_profile(
        &self,
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<UserWithProfile>, sqlx::Error>;

    /// Set verification token
    async fn set_verification_token(
        &self,
        pool: &PgPool,
        id: Uuid,
        token: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, sqlx::Error>;

    /// Verify email with token
    async fn verify_email_with_token(
        &self,
        pool: &PgPool,
        token: &str,
    ) -> Result<bool, sqlx::Error>;

    /// Set password reset token
    async fn set_reset_token(
        &self,
        pool: &PgPool,
        email: &str,
        token: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, sqlx::Error>;

    /// Find user by reset token
    async fn find_by_reset_token(
        &self,
        pool: &PgPool,
        token: &str,
    ) -> Result<Option<User>, sqlx::Error>;

    /// Clear reset token
    async fn clear_reset_token(&self, pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error>;

    /// Set pending email with token
    async fn set_pending_email(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        new_email: &str,
        token: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, sqlx::Error>;

    /// Verify pending email and update
    async fn verify_pending_email(
        &self,
        pool: &PgPool,
        token: &str,
    ) -> Result<bool, sqlx::Error>;

    /// Clear pending email
    async fn clear_pending_email(&self, pool: &PgPool, user_id: Uuid) -> Result<bool, sqlx::Error>;
}

#[derive(Debug, Clone, Default)]
pub struct UserRepositoryImpl;

impl UserRepositoryImpl {
    pub const fn new() -> Self {
        Self
    }
}

#[async_trait]
impl UserRepository for UserRepositoryImpl {
    async fn create(
        &self,
        pool: &PgPool,
        email: &str,
        username: Option<&str>,
    ) -> Result<User, UserRepositoryError> {
        // Check email exists
        if self.exists_by_email(pool, email).await? {
            return Err(UserRepositoryError::EmailExists);
        }

        // Check username exists (if provided)
        if let Some(uname) = username
            && self.exists_by_username(pool, uname).await?
        {
            return Err(UserRepositoryError::UsernameExists);
        }

        let user = sqlx::query_as::<_, User>(
            r"
            INSERT INTO users (email, username)
            VALUES ($1, $2)
            RETURNING *
            ",
        )
        .bind(email)
        .bind(username)
        .fetch_one(pool)
        .await?;

        Ok(user)
    }

    async fn find_by_id(&self, pool: &PgPool, id: Uuid) -> Result<Option<User>, sqlx::Error> {
        let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(user)
    }

    async fn find_by_email(&self, pool: &PgPool, email: &str) -> Result<Option<User>, sqlx::Error> {
        let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(pool)
            .await?;
        Ok(user)
    }

    async fn find_by_username(
        &self,
        pool: &PgPool,
        username: &str,
    ) -> Result<Option<User>, sqlx::Error> {
        let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
            .bind(username)
            .fetch_optional(pool)
            .await?;
        Ok(user)
    }

    async fn list(&self, pool: &PgPool, limit: i64, offset: i64) -> Result<Vec<User>, sqlx::Error> {
        let users = sqlx::query_as::<_, User>(
            "SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;
        Ok(users)
    }

    async fn update(
        &self,
        pool: &PgPool,
        id: Uuid,
        email: Option<&str>,
        username: Option<&str>,
    ) -> Result<Option<User>, sqlx::Error> {
        // Build dynamic query based on provided fields
        let mut query = String::from("UPDATE users SET updated_at = NOW()");
        let mut next_param = 2; // $1 is id

        if email.is_some() {
            use std::fmt::Write;
            write!(&mut query, ", email = ${next_param}").unwrap();
            next_param += 1;
        }
        if username.is_some() {
            use std::fmt::Write;
            write!(&mut query, ", username = ${next_param}").unwrap();
        }

        query.push_str(" WHERE id = $1 RETURNING *");

        // Build query and bind params
        let mut query_builder = sqlx::query_as::<_, User>(&query).bind(id);

        if let Some(e) = email {
            query_builder = query_builder.bind(e);
        }
        if let Some(u) = username {
            query_builder = query_builder.bind(u);
        }

        let user = query_builder.fetch_optional(pool).await?;
        Ok(user)
    }

    async fn delete(&self, pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn exists_by_email(&self, pool: &PgPool, email: &str) -> Result<bool, sqlx::Error> {
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)")
                .bind(email)
                .fetch_one(pool)
                .await?;
        Ok(exists)
    }

    async fn exists_by_username(&self, pool: &PgPool, username: &str) -> Result<bool, sqlx::Error> {
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)")
                .bind(username)
                .fetch_one(pool)
                .await?;
        Ok(exists)
    }

    async fn update_role(
        &self,
        pool: &PgPool,
        id: Uuid,
        role: &str,
    ) -> Result<Option<User>, sqlx::Error> {
        let user = sqlx::query_as::<_, User>(
            "UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
        )
        .bind(id)
        .bind(role)
        .fetch_optional(pool)
        .await?;
        Ok(user)
    }

    async fn set_email_verified(
        &self,
        pool: &PgPool,
        id: Uuid,
        verified: bool,
    ) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE users SET email_verified = $2, updated_at = NOW() WHERE id = $1")
                .bind(id)
                .bind(verified)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn set_active(&self, pool: &PgPool, id: Uuid, active: bool) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE users SET is_active = $2, updated_at = NOW() WHERE id = $1")
                .bind(id)
                .bind(active)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn find_with_profile(
        &self,
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<UserWithProfile>, sqlx::Error> {
        let row = sqlx::query_as::<_, UserWithProfile>(
            r"
            SELECT 
                u.id, u.email, u.username, u.is_active, u.email_verified, u.role, u.created_at, u.updated_at,
                p.full_name, p.display_name, p.avatar_url, p.bio, p.phone_number
            FROM users u
            LEFT JOIN user_profiles p ON p.user_id = u.id
            WHERE u.id = $1
            ",
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;
        Ok(row)
    }

    async fn set_verification_token(
        &self,
        pool: &PgPool,
        id: Uuid,
        token: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET verification_token = $2, verification_token_expires_at = $3, updated_at = NOW() WHERE id = $1"
        )
        .bind(id)
        .bind(token)
        .bind(expires_at)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn verify_email_with_token(
        &self,
        pool: &PgPool,
        token: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expires_at = NULL, updated_at = NOW() 
             WHERE verification_token = $1 AND verification_token_expires_at > NOW()"
        )
        .bind(token)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn set_reset_token(
        &self,
        pool: &PgPool,
        email: &str,
        token: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET reset_token = $2, reset_token_expires_at = $3, updated_at = NOW() WHERE email = $1"
        )
        .bind(email)
        .bind(token)
        .bind(expires_at)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn find_by_reset_token(
        &self,
        pool: &PgPool,
        token: &str,
    ) -> Result<Option<User>, sqlx::Error> {
        let user = sqlx::query_as::<_, User>(
            "SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires_at > NOW()",
        )
        .bind(token)
        .fetch_optional(pool)
        .await?;
        Ok(user)
    }

    async fn clear_reset_token(&self, pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET reset_token = NULL, reset_token_expires_at = NULL, updated_at = NOW() WHERE id = $1"
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn set_pending_email(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        new_email: &str,
        token: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET pending_email = $2, pending_email_token = $3, pending_email_token_expires_at = $4, updated_at = NOW() WHERE id = $1"
        )
        .bind(user_id)
        .bind(new_email)
        .bind(token)
        .bind(expires_at)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn verify_pending_email(
        &self,
        pool: &PgPool,
        token: &str,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET email = pending_email, pending_email = NULL, pending_email_token = NULL, pending_email_token_expires_at = NULL, updated_at = NOW() 
             WHERE pending_email_token = $1 AND pending_email_token_expires_at > NOW()"
        )
        .bind(token)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn clear_pending_email(&self, pool: &PgPool, user_id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE users SET pending_email = NULL, pending_email_token = NULL, pending_email_token_expires_at = NULL, updated_at = NOW() WHERE id = $1"
        )
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }
}

// =============================================================================
// User Profile Repository
// =============================================================================

#[async_trait]
pub trait UserProfileRepository: Send + Sync {
    /// Create profile for user
    async fn create(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<UserProfile, UserRepositoryError>;

    /// Get profile by user ID
    async fn find_by_user_id(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Option<UserProfile>, sqlx::Error>;

    /// Update profile
    async fn update(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        full_name: Option<&str>,
        display_name: Option<&str>,
        bio: Option<&str>,
        avatar_url: Option<&str>,
    ) -> Result<Option<UserProfile>, sqlx::Error>;

    /// Update avatar only
    async fn update_avatar(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        avatar_url: Option<&str>,
    ) -> Result<bool, sqlx::Error>;

    /// Get user with profile (joined view)
    async fn get_user_with_profile(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Option<UserWithProfile>, sqlx::Error>;
}

#[derive(Debug, Clone, Default)]
pub struct UserProfileRepositoryImpl;

impl UserProfileRepositoryImpl {
    pub const fn new() -> Self {
        Self
    }
}

#[async_trait]
impl UserProfileRepository for UserProfileRepositoryImpl {
    async fn create(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<UserProfile, UserRepositoryError> {
        let profile = sqlx::query_as::<_, UserProfile>(
            r"
            INSERT INTO user_profiles (user_id)
            VALUES ($1)
            RETURNING *
            ",
        )
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        Ok(profile)
    }

    async fn find_by_user_id(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Option<UserProfile>, sqlx::Error> {
        let profile =
            sqlx::query_as::<_, UserProfile>("SELECT * FROM user_profiles WHERE user_id = $1")
                .bind(user_id)
                .fetch_optional(pool)
                .await?;
        Ok(profile)
    }

    async fn update(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        full_name: Option<&str>,
        display_name: Option<&str>,
        bio: Option<&str>,
        avatar_url: Option<&str>,
    ) -> Result<Option<UserProfile>, sqlx::Error> {
        let profile = sqlx::query_as::<_, UserProfile>(
            r"
            UPDATE user_profiles SET
                full_name = COALESCE($2, full_name),
                display_name = COALESCE($3, display_name),
                bio = COALESCE($4, bio),
                avatar_url = COALESCE($5, avatar_url),
                updated_at = NOW()
            WHERE user_id = $1
            RETURNING *
            ",
        )
        .bind(user_id)
        .bind(full_name)
        .bind(display_name)
        .bind(bio)
        .bind(avatar_url)
        .fetch_optional(pool)
        .await?;

        Ok(profile)
    }

    async fn update_avatar(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        avatar_url: Option<&str>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE user_profiles SET avatar_url = $2, updated_at = NOW() WHERE user_id = $1",
        )
        .bind(user_id)
        .bind(avatar_url)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    async fn get_user_with_profile(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Option<UserWithProfile>, sqlx::Error> {
        let row = sqlx::query_as::<_, UserWithProfile>(
            r"
            SELECT 
                u.id, u.email, u.username, u.is_active, u.email_verified, u.role, u.created_at, u.updated_at,
                p.full_name, p.display_name, p.avatar_url, p.bio, p.phone_number
            FROM users u
            LEFT JOIN user_profiles p ON p.user_id = u.id
            WHERE u.id = $1
            ",
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(row)
    }
}
