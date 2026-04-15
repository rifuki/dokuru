use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ErrorCode(pub &'static str);

impl std::fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Auth errors
pub mod auth {
    use super::ErrorCode;
    pub const INVALID_CREDENTIALS: ErrorCode = ErrorCode("AUTH_001");
    pub const EMAIL_EXISTS: ErrorCode = ErrorCode("AUTH_002");
    pub const TOKEN_EXPIRED: ErrorCode = ErrorCode("AUTH_003");
    pub const TOKEN_INVALID: ErrorCode = ErrorCode("AUTH_004");
    pub const UNAUTHORIZED: ErrorCode = ErrorCode("AUTH_005");
    pub const FORBIDDEN: ErrorCode = ErrorCode("AUTH_006");
    pub const API_KEY_INVALID: ErrorCode = ErrorCode("AUTH_007");
    pub const USER_NOT_FOUND: ErrorCode = ErrorCode("AUTH_008");
    pub const INTERNAL_ERROR: ErrorCode = ErrorCode("AUTH_009");
}

/// Validation errors
pub mod validation {
    use super::ErrorCode;
    pub const INVALID_INPUT: ErrorCode = ErrorCode("VAL_001");
    pub const MISSING_FIELD: ErrorCode = ErrorCode("VAL_002");
    pub const INVALID_FORMAT: ErrorCode = ErrorCode("VAL_003");
}

/// Generic errors
pub mod generic {
    use super::ErrorCode;
    pub const NOT_FOUND: ErrorCode = ErrorCode("GEN_001");
    pub const INTERNAL: ErrorCode = ErrorCode("GEN_002");
    pub const RATE_LIMITED: ErrorCode = ErrorCode("GEN_003");
    pub const FORBIDDEN: ErrorCode = ErrorCode("GEN_004");
    pub const INVALID_INPUT: ErrorCode = ErrorCode("GEN_005");
}
