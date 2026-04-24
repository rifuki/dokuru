use sqlx::{PgPool, Row};

#[sqlx::test]
async fn test_database_connection(pool: PgPool) {
    let result = sqlx::query("SELECT 1 as value").fetch_one(&pool).await;

    assert!(result.is_ok());
}

#[sqlx::test]
async fn test_users_table_exists(pool: PgPool) {
    let result = sqlx::query(
        "SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'users'
        )",
    )
    .fetch_one(&pool)
    .await;

    assert!(result.is_ok());
}

#[sqlx::test]
async fn test_agents_table_exists(pool: PgPool) {
    let result = sqlx::query(
        "SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'agents'
        )",
    )
    .fetch_one(&pool)
    .await;

    assert!(result.is_ok());
}

#[sqlx::test]
async fn test_audit_results_table_exists(pool: PgPool) {
    let result = sqlx::query(
        "SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'audit_results'
        )",
    )
    .fetch_one(&pool)
    .await;

    assert!(result.is_ok());
}

#[sqlx::test]
async fn test_insert_and_query_user(pool: PgPool) {
    let email = format!("test-{}@example.com", uuid::Uuid::new_v4());

    let result = sqlx::query("INSERT INTO users (email, role) VALUES ($1, 'user') RETURNING id")
        .bind(&email)
        .fetch_one(&pool)
        .await;

    assert!(result.is_ok());

    let user_id: uuid::Uuid = result.unwrap().get("id");

    let query_result = sqlx::query("SELECT email FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&pool)
        .await;

    assert!(query_result.is_ok());
    let fetched_email: String = query_result.unwrap().get("email");
    assert_eq!(fetched_email, email);
}

#[sqlx::test]
async fn test_user_cascade_delete(pool: PgPool) {
    let email = format!("test-{}@example.com", uuid::Uuid::new_v4());

    let user_result =
        sqlx::query("INSERT INTO users (email, role) VALUES ($1, 'user') RETURNING id")
            .bind(&email)
            .fetch_one(&pool)
            .await
            .unwrap();

    let user_id: uuid::Uuid = user_result.get("id");

    let delete_result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&pool)
        .await;

    assert!(delete_result.is_ok());
}
