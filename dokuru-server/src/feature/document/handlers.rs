use axum::{
    extract::{Multipart, Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::{
    feature::document::entity::Document,
    infrastructure::web::response::{ApiError, ApiResult, ApiSuccess},
    state::AppState,
};

pub async fn serve_document_file(State(state): State<AppState>) -> Response {
    let doc = match state.document_repo.get_current().await {
        Ok(Some(d)) => d,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("Failed to get document: {}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let bytes = match fs::read(&doc.file_path).await {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("Failed to read document file: {}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/pdf"));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("private, max-age=86400"));
    if let Ok(v) = format!("inline; filename=\"{}\"", doc.name).parse() {
        headers.insert(header::CONTENT_DISPOSITION, v);
    }

    (StatusCode::OK, headers, bytes).into_response()
}

pub async fn get_current_document(State(state): State<AppState>) -> ApiResult<Option<Document>> {
    let doc = state.document_repo.get_current().await.map_err(|e| {
        tracing::error!("Failed to get document: {}", e);
        ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_message("Failed to get document")
    })?;

    Ok(ApiSuccess::default().with_data(doc))
}

pub async fn upload_document(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> ApiResult<Document> {
    let upload_dir = "uploads/documents";
    fs::create_dir_all(upload_dir).await.map_err(|e| {
        tracing::error!("Failed to create upload dir: {}", e);
        ApiError::default()
            .with_code(StatusCode::INTERNAL_SERVER_ERROR)
            .with_message("Failed to create upload directory")
    })?;

    // Delete existing document first (only 1 allowed)
    if let Ok(Some(existing)) = state.document_repo.get_current().await {
        let _ = fs::remove_file(&existing.file_path).await;
        let _ = state.document_repo.delete(existing.id).await;
    }

    #[allow(clippy::never_loop)]
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        tracing::error!("Multipart error: {}", e);
        ApiError::default()
            .with_code(StatusCode::BAD_REQUEST)
            .with_message("Invalid multipart data")
    })? {
        let name = field.file_name().unwrap_or("document.pdf").to_string();
        let content_type = field
            .content_type()
            .unwrap_or("application/pdf")
            .to_string();

        let is_pdf = content_type.starts_with("application/pdf")
            || name.to_lowercase().ends_with(".pdf");
        if !is_pdf {
            return Err(ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message("Only PDF files are allowed"));
        }

        let data = field.bytes().await.map_err(|e| {
            tracing::error!("Failed to read file: {}", e);
            ApiError::default()
                .with_code(StatusCode::BAD_REQUEST)
                .with_message("Failed to read file")
        })?;

        #[allow(clippy::cast_possible_wrap)]
        let file_size = data.len() as i64;
        let file_name = format!("{}.pdf", Uuid::new_v4());
        let file_path = format!("{upload_dir}/{file_name}");

        let mut file = fs::File::create(&file_path).await.map_err(|e| {
            tracing::error!("Failed to create file: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to save file")
        })?;

        file.write_all(&data).await.map_err(|e| {
            tracing::error!("Failed to write file: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to write file")
        })?;

        let doc = state
            .document_repo
            .create(name, file_path, file_size, content_type)
            .await
            .map_err(|e| {
                tracing::error!("Failed to save document: {}", e);
                ApiError::default()
                    .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                    .with_message("Failed to save document")
            })?;

        return Ok(ApiSuccess::default().with_data(doc));
    }

    Err(ApiError::default()
        .with_code(StatusCode::BAD_REQUEST)
        .with_message("No file provided"))
}

pub async fn delete_document(State(state): State<AppState>, Path(id): Path<Uuid>) -> ApiResult<()> {
    if let Ok(Some(doc)) = state.document_repo.get_current().await
        && doc.id == id
    {
        let _ = fs::remove_file(&doc.file_path).await;
        state.document_repo.delete(id).await.map_err(|e| {
            tracing::error!("Failed to delete document: {}", e);
            ApiError::default()
                .with_code(StatusCode::INTERNAL_SERVER_ERROR)
                .with_message("Failed to delete document")
        })?;
    }

    Ok(ApiSuccess::default().with_data(()))
}
