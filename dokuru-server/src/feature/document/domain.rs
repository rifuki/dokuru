use bytes::Bytes;

pub const DOCUMENTS_SUBDIR: &str = "documents";
pub const PDF_CONTENT_TYPE: &str = "application/pdf";
pub const DEFAULT_DOCUMENT_NAME: &str = "document.pdf";
pub const MAX_DOCUMENT_SIZE_BYTES: usize = 50 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct DocumentUpload {
    pub original_name: String,
    pub content_type: String,
    pub bytes: Bytes,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DocumentValidationError {
    #[error("No file provided")]
    MissingFile,
    #[error("Only PDF files are allowed")]
    UnsupportedFileType,
    #[error("Document file cannot be empty")]
    EmptyFile,
    #[error("Document file exceeds the maximum size")]
    FileTooLarge,
}

impl DocumentUpload {
    /// # Errors
    ///
    /// Returns an error if the underlying operation fails.
    pub fn new(
        file_name: Option<&str>,
        content_type: Option<&str>,
        bytes: Bytes,
    ) -> Result<Self, DocumentValidationError> {
        validate_size(bytes.len())?;

        let original_name = clean_file_name(file_name.unwrap_or(DEFAULT_DOCUMENT_NAME));
        let content_type = content_type.unwrap_or(PDF_CONTENT_TYPE).to_string();

        if !is_pdf(&original_name, &content_type) {
            return Err(DocumentValidationError::UnsupportedFileType);
        }

        Ok(Self {
            original_name,
            content_type,
            bytes,
        })
    }
}

#[must_use]
pub fn is_pdf(file_name: &str, content_type: &str) -> bool {
    content_type.starts_with(PDF_CONTENT_TYPE) || file_name.to_lowercase().ends_with(".pdf")
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub const fn validate_size(size: usize) -> Result<(), DocumentValidationError> {
    if size == 0 {
        return Err(DocumentValidationError::EmptyFile);
    }

    if size > MAX_DOCUMENT_SIZE_BYTES {
        return Err(DocumentValidationError::FileTooLarge);
    }

    Ok(())
}

#[must_use]
pub fn clean_file_name(name: &str) -> String {
    let cleaned = name
        .chars()
        .filter(|c| !matches!(c, '\r' | '\n' | '"'))
        .collect::<String>()
        .trim()
        .to_string();

    if cleaned.is_empty() {
        DEFAULT_DOCUMENT_NAME.to_string()
    } else {
        cleaned
    }
}

#[must_use]
pub fn content_disposition(file_name: &str) -> String {
    format!("inline; filename=\"{}\"", clean_file_name(file_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_pdf_by_content_type() {
        assert!(is_pdf("document.bin", "application/pdf"));
    }

    #[test]
    fn accepts_pdf_by_extension() {
        assert!(is_pdf("manual.PDF", "application/octet-stream"));
    }

    #[test]
    fn rejects_non_pdf_upload() {
        let result = DocumentUpload::new(
            Some("manual.txt"),
            Some("text/plain"),
            Bytes::from_static(b"hello"),
        );

        assert_eq!(
            result.unwrap_err(),
            DocumentValidationError::UnsupportedFileType
        );
    }

    #[test]
    fn rejects_empty_upload() {
        let result = DocumentUpload::new(Some("manual.pdf"), Some(PDF_CONTENT_TYPE), Bytes::new());

        assert_eq!(result.unwrap_err(), DocumentValidationError::EmptyFile);
    }

    #[test]
    fn rejects_oversized_upload() {
        let result = validate_size(MAX_DOCUMENT_SIZE_BYTES + 1);

        assert_eq!(result.unwrap_err(), DocumentValidationError::FileTooLarge);
    }

    #[test]
    fn cleans_file_name_for_headers() {
        assert_eq!(clean_file_name("report\r\n\".pdf"), "report.pdf");
        assert_eq!(
            content_disposition("report\".pdf"),
            "inline; filename=\"report.pdf\""
        );
    }

    #[test]
    fn falls_back_to_default_name_when_cleaned_name_is_empty() {
        assert_eq!(clean_file_name("\r\n\""), DEFAULT_DOCUMENT_NAME);
    }
}
