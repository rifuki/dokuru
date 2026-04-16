use async_trait::async_trait;
use bytes::Bytes;
use std::path::PathBuf;
use tokio::fs;

use super::provider::{StorageError, StorageProvider};

/// Local filesystem storage backend.
///
/// Files are stored at `{upload_dir}/{key}` and served
/// via the static file middleware at `{base_url}/{key}`.
#[derive(Debug, Clone)]
pub struct LocalStorage {
    upload_dir: PathBuf,
    base_url: String,
}

impl LocalStorage {
    pub fn new(upload_dir: impl Into<PathBuf>, base_url: impl Into<String>) -> Self {
        Self {
            upload_dir: upload_dir.into(),
            base_url: base_url.into(),
        }
    }
}

#[async_trait]
impl StorageProvider for LocalStorage {
    async fn put(&self, key: &str, data: Bytes, _content_type: &str) -> Result<(), StorageError> {
        let dest = self.upload_dir.join(key);

        // Ensure parent directories exist.
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).await?;
        }

        fs::write(&dest, data).await?;
        Ok(())
    }

    async fn delete(&self, key: &str) -> Result<(), StorageError> {
        let path = self.upload_dir.join(key);
        match fs::remove_file(&path).await {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(StorageError::Io(e)),
        }
    }

    fn public_url(&self, key: &str) -> String {
        let base = self.base_url.trim_end_matches('/');
        format!("{base}/{key}")
    }
}
