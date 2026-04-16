use async_trait::async_trait;
use bytes::Bytes;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Storage error: {0}")]
    Other(String),
}

/// Abstraction over any file/object storage backend.
///
/// `key` is a logical path such as `avatars/uuid.jpg`.
/// Implementations decide how to map that to the physical storage
/// (local filesystem, S3, GCS, etc.) and what URL to return.
#[async_trait]
pub trait StorageProvider: Send + Sync {
    /// Store `data` at `key` with the given `content_type`.
    async fn put(&self, key: &str, data: Bytes, content_type: &str) -> Result<(), StorageError>;

    /// Delete the object at `key`. Succeeds even if the key does not exist.
    async fn delete(&self, key: &str) -> Result<(), StorageError>;

    /// Return the publicly accessible URL for `key`.
    fn public_url(&self, key: &str) -> String;
}
