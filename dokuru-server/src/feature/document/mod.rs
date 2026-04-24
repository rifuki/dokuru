pub mod domain;
pub mod entity;
pub mod handlers;
pub mod repository;
pub mod routes;
pub mod service;

pub use entity::Document;
pub use repository::DocumentRepository;
pub use routes::document_routes;
pub use service::DocumentService;
