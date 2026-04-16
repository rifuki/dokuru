use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// User session entity for device tracking
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct UserSession {
    pub id: Uuid,
    pub user_id: Uuid,
    pub auth_method_id: Option<Uuid>,
    pub session_id: String,
    pub device_name: Option<String>,
    pub device_type: Option<String>,
    pub ip_address: String,
    pub user_agent: Option<String>,
    pub location: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_active_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub is_active: bool,
    pub revoked_at: Option<DateTime<Utc>>,
    pub revoked_reason: Option<String>,
}

/// Device information extracted from request
#[derive(Debug, Clone, Deserialize)]
pub struct DeviceInfo {
    pub name: String,
    pub device_type: String,
    pub user_agent: String,
    pub ip_address: String,
}

impl DeviceInfo {
    /// Parse user agent to get device name
    pub fn from_user_agent(user_agent: &str, ip: &str) -> Self {
        let (name, device_type) = Self::parse_user_agent(user_agent);

        Self {
            name,
            device_type,
            user_agent: user_agent.to_string(),
            ip_address: ip.to_string(),
        }
    }

    fn parse_user_agent(ua: &str) -> (String, String) {
        let ua_lower = ua.to_lowercase();

        // Detect device type
        let device_type = if ua_lower.contains("mobile") {
            "mobile"
        } else if ua_lower.contains("tablet") || ua_lower.contains("ipad") {
            "tablet"
        } else {
            "desktop"
        }
        .to_string();

        // Detect browser
        let browser = if ua_lower.contains("chrome") {
            "Chrome"
        } else if ua_lower.contains("firefox") {
            "Firefox"
        } else if ua_lower.contains("safari") && !ua_lower.contains("chrome") {
            "Safari"
        } else if ua_lower.contains("edge") {
            "Edge"
        } else {
            "Unknown"
        };

        // Detect OS
        let os = if ua_lower.contains("windows") {
            "Windows"
        } else if ua_lower.contains("macintosh") || ua_lower.contains("mac os") {
            "macOS"
        } else if ua_lower.contains("linux") {
            "Linux"
        } else if ua_lower.contains("android") {
            "Android"
        } else if ua_lower.contains("iphone") || ua_lower.contains("ipad") {
            "iOS"
        } else {
            "Unknown"
        };

        let name = format!("{} on {}", browser, os);
        (name, device_type)
    }
}

/// Response DTO for session list
#[derive(Debug, Clone, Serialize)]
pub struct SessionResponse {
    pub id: Uuid,
    pub device_name: Option<String>,
    pub device_type: Option<String>,
    pub ip_address: String,
    pub location: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_active_at: DateTime<Utc>,
    pub is_current: bool,
}
