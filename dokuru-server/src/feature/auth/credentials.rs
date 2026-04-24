use chrono::{DateTime, Utc};

use super::{auth_method::AuthProvider, session::DeviceInfo};

/// Login credentials for password authentication
#[derive(Debug, Clone)]
pub struct LoginCredentials {
    pub identifier: String,
    pub password: String,
    pub device_info: Option<DeviceInfo>,
}

impl LoginCredentials {
    #[must_use]
    pub fn new(identifier: String, password: String) -> Self {
        Self {
            identifier,
            password,
            device_info: None,
        }
    }

    #[must_use]
    pub fn with_device_info(mut self, device_info: DeviceInfo) -> Self {
        self.device_info = Some(device_info);
        self
    }
}

/// Registration data for new user
#[derive(Debug, Clone)]
pub struct RegisterData {
    pub email: String,
    pub username: Option<String>,
    pub password: String,
    pub full_name: Option<String>,
    pub device_info: Option<DeviceInfo>,
}

impl RegisterData {
    #[must_use]
    pub fn new(email: String, password: String) -> Self {
        Self {
            email,
            username: None,
            password,
            full_name: None,
            device_info: None,
        }
    }

    #[must_use]
    pub fn with_username(mut self, username: String) -> Self {
        self.username = Some(username);
        self
    }

    #[must_use]
    pub fn with_full_name(mut self, full_name: String) -> Self {
        self.full_name = Some(full_name);
        self
    }

    #[must_use]
    pub fn with_device_info(mut self, device_info: DeviceInfo) -> Self {
        self.device_info = Some(device_info);
        self
    }
}

/// OAuth credentials from provider
#[derive(Debug, Clone)]
pub struct OAuthCredentials {
    pub provider: AuthProvider,
    pub provider_id: String,
    pub email: String,
    pub name: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

impl OAuthCredentials {
    #[must_use]
    pub fn new(provider: AuthProvider, provider_id: String, email: String) -> Self {
        Self {
            provider,
            provider_id,
            email,
            name: None,
            access_token: None,
            refresh_token: None,
            expires_at: None,
        }
    }

    #[must_use]
    pub fn with_name(mut self, name: String) -> Self {
        self.name = Some(name);
        self
    }

    #[must_use]
    pub fn with_tokens(mut self, access: String, refresh: Option<String>) -> Self {
        self.access_token = Some(access);
        self.refresh_token = refresh;
        self
    }

    #[must_use]
    pub const fn with_expires_at(mut self, expires_at: DateTime<Utc>) -> Self {
        self.expires_at = Some(expires_at);
        self
    }
}
