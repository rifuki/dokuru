pub mod auth_method;
pub mod handlers;
mod repository;
mod routes;
pub mod service;
pub mod session;
pub mod types;
pub mod utils;

pub use handlers::{
    change_password, list_sessions, login, logout, logout_all_sessions, me, refresh, register,
    revoke_session,
};
pub use repository::AuthError;
pub use routes::{auth_routes, auth_sensitive_routes};
pub use types::{
    AuthResponse, AuthUser, Claims, LoginCredentials, RegisterRequest, Role, TokenType,
    UserResponse,
};
pub use utils::REFRESH_TOKEN_COOKIE;
