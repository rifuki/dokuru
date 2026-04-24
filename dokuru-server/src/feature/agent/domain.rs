use chrono::{DateTime, Duration, Utc};

pub const DEFAULT_AGENT_STATUS: &str = "unknown";
pub const RELAY_AGENT_URL: &str = "relay";
pub const ONLINE_THRESHOLD_MINUTES: i64 = 10;
pub const MIN_AGENT_NAME_LEN: usize = 1;
pub const MAX_AGENT_NAME_LEN: usize = 255;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessMode {
    Direct,
    Cloudflare,
    Domain,
    Relay,
}

impl AccessMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Direct => "direct",
            Self::Cloudflare => "cloudflare",
            Self::Domain => "domain",
            Self::Relay => "relay",
        }
    }

    pub fn parse(value: &str) -> Result<Self, AgentValidationError> {
        match value {
            "direct" => Ok(Self::Direct),
            "cloudflare" => Ok(Self::Cloudflare),
            "domain" => Ok(Self::Domain),
            "relay" => Ok(Self::Relay),
            _ => Err(AgentValidationError::InvalidAccessMode),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentStatus {
    Online,
    Offline,
    Unknown,
}

impl AgentStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Online => "online",
            Self::Offline => "offline",
            Self::Unknown => DEFAULT_AGENT_STATUS,
        }
    }

    pub fn parse(value: &str) -> Result<Self, AgentValidationError> {
        match value {
            "online" => Ok(Self::Online),
            "offline" => Ok(Self::Offline),
            "unknown" => Ok(Self::Unknown),
            _ => Err(AgentValidationError::InvalidStatus),
        }
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AgentValidationError {
    #[error("Name must be between 1 and 255 characters")]
    InvalidName,
    #[error("Invalid URL format")]
    InvalidUrl,
    #[error("Access mode must be: direct, cloudflare, domain, or relay")]
    InvalidAccessMode,
    #[error("Status must be: online, offline, or unknown")]
    InvalidStatus,
    #[error("Token is required")]
    EmptyToken,
    #[error("Stored token is not valid base64")]
    InvalidStoredToken,
    #[error("Stored token is not valid UTF-8")]
    InvalidStoredTokenUtf8,
}

pub fn validate_agent_name(name: &str) -> Result<(), AgentValidationError> {
    let len = name.trim().chars().count();
    if (MIN_AGENT_NAME_LEN..=MAX_AGENT_NAME_LEN).contains(&len) {
        Ok(())
    } else {
        Err(AgentValidationError::InvalidName)
    }
}

pub fn validate_agent_url(agent_url: &str) -> Result<(), AgentValidationError> {
    if agent_url == RELAY_AGENT_URL {
        return Ok(());
    }

    url::Url::parse(agent_url)
        .map(|_| ())
        .map_err(|_| AgentValidationError::InvalidUrl)
}

pub fn validate_access_mode(mode: &str) -> Result<AccessMode, AgentValidationError> {
    AccessMode::parse(mode)
}

pub fn validate_status(status: &str) -> Result<AgentStatus, AgentValidationError> {
    AgentStatus::parse(status)
}

pub fn validate_token(token: &str) -> Result<(), AgentValidationError> {
    if token.is_empty() {
        Err(AgentValidationError::EmptyToken)
    } else {
        Ok(())
    }
}

pub fn hash_token(token: &str) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn encode_token(token: &str) -> String {
    use base64::{Engine as _, engine::general_purpose};

    general_purpose::STANDARD.encode(token.as_bytes())
}

pub fn decode_token(encoded: &str) -> Result<String, AgentValidationError> {
    use base64::{Engine as _, engine::general_purpose};

    let decoded = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| AgentValidationError::InvalidStoredToken)?;

    String::from_utf8(decoded).map_err(|_| AgentValidationError::InvalidStoredTokenUtf8)
}

pub fn is_agent_online_at(last_seen: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
    last_seen.is_some_and(|last_seen| {
        now.signed_duration_since(last_seen) < Duration::minutes(ONLINE_THRESHOLD_MINUTES)
    })
}

pub fn is_agent_online(last_seen: Option<DateTime<Utc>>) -> bool {
    is_agent_online_at(last_seen, Utc::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_supported_access_modes() {
        for mode in ["direct", "cloudflare", "domain", "relay"] {
            assert!(validate_access_mode(mode).is_ok());
        }

        assert_eq!(
            validate_access_mode("tunnel").unwrap_err(),
            AgentValidationError::InvalidAccessMode
        );
    }

    #[test]
    fn validates_supported_statuses() {
        for status in ["online", "offline", "unknown"] {
            assert!(validate_status(status).is_ok());
        }

        assert_eq!(
            validate_status("degraded").unwrap_err(),
            AgentValidationError::InvalidStatus
        );
    }

    #[test]
    fn validates_agent_names_after_trimming() {
        assert!(validate_agent_name("production-agent").is_ok());
        assert_eq!(
            validate_agent_name("   ").unwrap_err(),
            AgentValidationError::InvalidName
        );
        assert_eq!(
            validate_agent_name(&"a".repeat(MAX_AGENT_NAME_LEN + 1)).unwrap_err(),
            AgentValidationError::InvalidName
        );
    }

    #[test]
    fn validates_relay_or_parseable_agent_urls() {
        assert!(validate_agent_url(RELAY_AGENT_URL).is_ok());
        assert!(validate_agent_url("http://localhost:3939").is_ok());
        assert!(validate_agent_url("https://agent.example.com").is_ok());
        assert_eq!(
            validate_agent_url("not-a-url").unwrap_err(),
            AgentValidationError::InvalidUrl
        );
    }

    #[test]
    fn token_hash_is_sha256_hex() {
        assert_eq!(
            hash_token("test"),
            "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        );
        assert_eq!(hash_token("test").len(), 64);
    }

    #[test]
    fn token_encoding_round_trips() {
        let token = "plain-token-123";
        let encoded = encode_token(token);

        assert_ne!(encoded, token);
        assert_eq!(decode_token(&encoded).unwrap(), token);
    }

    #[test]
    fn invalid_stored_token_is_rejected() {
        assert_eq!(
            decode_token("not valid base64").unwrap_err(),
            AgentValidationError::InvalidStoredToken
        );
    }

    #[test]
    fn detects_online_agents_from_last_seen() {
        let now = Utc::now();

        assert!(is_agent_online_at(Some(now - Duration::minutes(5)), now));
        assert!(!is_agent_online_at(Some(now - Duration::minutes(10)), now));
        assert!(!is_agent_online_at(None, now));
    }
}
