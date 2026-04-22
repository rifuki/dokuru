use sqlx::PgPool;
use uuid::Uuid;
use crate::feature::document::entity::Document;

pub struct DocumentRepository {
    pool: PgPool,
}

impl DocumentRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_current(&self) -> Result<Option<Document>, sqlx::Error> {
        sqlx::query_as::<_, Document>("SELECT * FROM documents ORDER BY uploaded_at DESC LIMIT 1")
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn create(&self, name: String, file_path: String, file_size: i64, mime_type: String) -> Result<Document, sqlx::Error> {
        sqlx::query_as::<_, Document>(
            "INSERT INTO documents (name, file_path, file_size, mime_type) VALUES ($1, $2, $3, $4) RETURNING *"
        )
        .bind(name)
        .bind(file_path)
        .bind(file_size)
        .bind(mime_type)
        .fetch_one(&self.pool)
        .await
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM documents WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_all(&self) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM documents")
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
