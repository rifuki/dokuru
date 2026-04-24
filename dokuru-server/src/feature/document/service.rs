use std::{path::PathBuf, sync::Arc};

use bytes::Bytes;
use tokio::fs;
use uuid::Uuid;

use super::{
    domain::{DOCUMENTS_SUBDIR, DocumentUpload, DocumentValidationError},
    entity::Document,
    repository::DocumentRepository,
};

#[derive(Debug, thiserror::Error)]
pub enum DocumentServiceError {
    #[error(transparent)]
    Validation(#[from] DocumentValidationError),
    #[error("Database operation failed: {0}")]
    Database(#[from] sqlx::Error),
    #[error("File operation failed: {0}")]
    File(#[from] std::io::Error),
}

#[derive(Clone)]
pub struct DocumentService {
    repository: Arc<DocumentRepository>,
    upload_dir: PathBuf,
}

impl DocumentService {
    pub fn new(repository: Arc<DocumentRepository>, upload_dir: impl Into<PathBuf>) -> Self {
        Self {
            repository,
            upload_dir: upload_dir.into(),
        }
    }

    pub async fn current_document(&self) -> Result<Option<Document>, DocumentServiceError> {
        self.repository
            .get_current()
            .await
            .map_err(DocumentServiceError::Database)
    }

    pub async fn current_file(&self) -> Result<Option<(Document, Bytes)>, DocumentServiceError> {
        let Some(document) = self.current_document().await? else {
            return Ok(None);
        };

        let bytes = fs::read(&document.file_path).await?;
        Ok(Some((document, Bytes::from(bytes))))
    }

    pub async fn replace_document(
        &self,
        file_name: Option<&str>,
        content_type: Option<&str>,
        bytes: Bytes,
    ) -> Result<Document, DocumentServiceError> {
        let upload = DocumentUpload::new(file_name, content_type, bytes)?;
        let existing = self.current_document().await?;

        let file_path = self.new_file_path();
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        fs::write(&file_path, &upload.bytes).await?;

        let document = self
            .repository
            .create(
                upload.original_name,
                file_path.to_string_lossy().to_string(),
                upload.bytes.len() as i64,
                upload.content_type,
            )
            .await
            .inspect_err(|_| {
                let path = file_path.clone();
                tokio::spawn(async move {
                    let _ = fs::remove_file(path).await;
                });
            })?;

        if let Some(existing) = existing {
            let _ = fs::remove_file(&existing.file_path).await;
            self.repository.delete(existing.id).await?;
        }

        Ok(document)
    }

    pub async fn delete_current_if_matches(&self, id: Uuid) -> Result<bool, DocumentServiceError> {
        let Some(document) = self.current_document().await? else {
            return Ok(false);
        };

        if document.id != id {
            return Ok(false);
        }

        let _ = fs::remove_file(&document.file_path).await;
        self.repository.delete(id).await?;
        Ok(true)
    }

    fn new_file_path(&self) -> PathBuf {
        self.upload_dir
            .join(DOCUMENTS_SUBDIR)
            .join(format!("{}.pdf", Uuid::new_v4()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn generated_file_path_uses_documents_subdirectory_and_pdf_extension() {
        let repository = Arc::new(DocumentRepository::new(
            sqlx::PgPool::connect_lazy("postgres://dokuru:secret@localhost:5432/dokuru_db")
                .unwrap(),
        ));
        let service = DocumentService::new(repository, "uploads");

        let path = service.new_file_path();

        assert!(path.starts_with("uploads/documents"));
        assert_eq!(path.extension().and_then(|ext| ext.to_str()), Some("pdf"));
    }
}
