pub mod avatar;
pub mod dto;
pub mod email_change;
pub mod entity;
mod handler;
pub mod repository;
mod routes;

#[cfg(test)]
mod entity_tests;
#[cfg(test)]
mod service_tests;

pub use avatar::{delete_avatar, upload_avatar};
pub use dto::{CreateUser, UpdateUser};
pub use email_change::{request_email_change, verify_email_change};
pub use entity::{User, UserProfile, UserWithProfile};
pub use handler::{get_me, update_me};
pub use repository::{
    UserProfileRepository, UserProfileRepositoryImpl, UserRepository, UserRepositoryError,
    UserRepositoryImpl,
};
pub use routes::user_routes;
