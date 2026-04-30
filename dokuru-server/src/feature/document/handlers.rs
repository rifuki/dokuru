use axum::{
    extract::{Multipart, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use uuid::Uuid;

use crate::{
    feature::document::{
        domain::{DocumentValidationError, PDF_CONTENT_TYPE, content_disposition},
        entity::Document,
        service::DocumentServiceError,
    },
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

pub async fn serve_document_file(State(state): State<AppState>) -> Response {
    let (doc, bytes) = match state.document_service.current_file().await {
        Ok(Some(file)) => file,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("Failed to read document file: {}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(PDF_CONTENT_TYPE),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=86400"),
    );
    if let Ok(v) = content_disposition(&doc.name).parse() {
        headers.insert(header::CONTENT_DISPOSITION, v);
    }

    (StatusCode::OK, headers, bytes).into_response()
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn get_current_document(State(state): State<AppState>) -> ApiResult<Option<Document>> {
    let doc = state
        .document_service
        .current_document()
        .await
        .map_err(|e| {
            tracing::error!("Failed to get document: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to get document")
        })?;

    Ok(ApiSuccess::default().with_data(doc))
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn upload_document(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> ApiResult<Document> {
    if let Some(field) = multipart.next_field().await.map_err(|e| {
        tracing::error!("Multipart error: {}", e);
        ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Invalid multipart data")
    })? {
        let name = field.file_name().map(str::to_string);
        let content_type = field.content_type().map(str::to_string);

        let data = field.bytes().await.map_err(|e| {
            tracing::error!("Failed to read file: {}", e);
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message("Failed to read file")
        })?;

        let doc = state
            .document_service
            .replace_document(name.as_deref(), content_type.as_deref(), data)
            .await
            .map_err(document_error_to_api_error)?;

        return Ok(ApiSuccess::default().with_data(doc));
    }

    Err(document_error_to_api_error(
        DocumentValidationError::MissingFile.into(),
    ))
}

/// # Errors
///
/// Returns an error if the underlying operation fails.
pub async fn delete_document(State(state): State<AppState>, Path(id): Path<Uuid>) -> ApiResult<()> {
    state
        .document_service
        .delete_current_if_matches(id)
        .await
        .map_err(document_error_to_api_error)?;

    Ok(ApiSuccess::default().with_data(()))
}

fn document_error_to_api_error(error: DocumentServiceError) -> ApiError {
    match error {
        DocumentServiceError::Validation(error) => ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message(error.to_string()),
        DocumentServiceError::Database(error) => ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_message("Failed to save document")
            .log_only(error),
        DocumentServiceError::File(error) => ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_message("Failed to process document file")
            .log_only(error),
    }
}
