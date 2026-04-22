use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::{
    feature::document::{entity::Document, repository::DocumentRepository},
    infrastructure::response::{ApiResponse, ApiResult},
};

pub async fn get_current_document(
    State(repo): State<Arc<DocumentRepository>>,
) -> ApiResult<Option<Document>> {
    let doc = repo.get_current().await.map_err(|e| {
        tracing::error!("Failed to get document: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error("Failed to get document")))
    })?;
    
    Ok(Json(ApiResponse::success(doc)))
}

pub async fn upload_document(
    State(repo): State<Arc<DocumentRepository>>,
    mut multipart: Multipart,
) -> ApiResult<Document> {
    let upload_dir = "uploads/documents";
    fs::create_dir_all(upload_dir).await.map_err(|e| {
        tracing::error!("Failed to create upload dir: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error("Failed to create upload directory")))
    })?;

    // Delete existing document first (only 1 allowed)
    if let Ok(Some(existing)) = repo.get_current().await {
        let _ = fs::remove_file(&existing.file_path).await;
        let _ = repo.delete(existing.id).await;
    }

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        tracing::error!("Multipart error: {}", e);
        (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::error("Invalid multipart data")))
    })? {
        let name = field.file_name().unwrap_or("document.pdf").to_string();
        let content_type = field.content_type().unwrap_or("application/pdf").to_string();
        
        if content_type != "application/pdf" {
            return Err((StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::error("Only PDF files are allowed"))));
        }

        let data = field.bytes().await.map_err(|e| {
            tracing::error!("Failed to read file: {}", e);
            (StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::error("Failed to read file")))
        })?;

        let file_size = data.len() as i64;
        let file_name = format!("{}.pdf", Uuid::new_v4());
        let file_path = format!("{}/{}", upload_dir, file_name);

        let mut file = fs::File::create(&file_path).await.map_err(|e| {
            tracing::error!("Failed to create file: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error("Failed to save file")))
        })?;

        file.write_all(&data).await.map_err(|e| {
            tracing::error!("Failed to write file: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error("Failed to write file")))
        })?;

        let doc = repo.create(name, file_path, file_size, content_type).await.map_err(|e| {
            tracing::error!("Failed to save document: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error("Failed to save document")))
        })?;

        return Ok(Json(ApiResponse::success(doc)));
    }

    Err((StatusCode::BAD_REQUEST, Json(ApiResponse::<()>::error("No file provided"))))
}

pub async fn delete_document(
    State(repo): State<Arc<DocumentRepository>>,
    Path(id): Path<Uuid>,
) -> ApiResult<()> {
    if let Ok(Some(doc)) = repo.get_current().await {
        if doc.id == id {
            let _ = fs::remove_file(&doc.file_path).await;
            repo.delete(id).await.map_err(|e| {
                tracing::error!("Failed to delete document: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiResponse::<()>::error("Failed to delete document")))
            })?;
        }
    }
    
    Ok(Json(ApiResponse::success(())))
}
