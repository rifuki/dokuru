pub mod dto;
pub mod entity;
pub mod handlers;
pub mod repository;
pub mod service;

pub use dto::{AuditResultResponse, SaveAuditDto};
pub use repository::{AuditResultRepository, AuditResultRepositoryImpl};
pub use service::AuditResultService;

#[cfg(test)]
mod dto_tests;
