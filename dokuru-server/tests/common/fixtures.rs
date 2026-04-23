use uuid::Uuid;

pub struct TestUser {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub password: String,
}

impl TestUser {
    pub fn new() -> Self {
        let id = Uuid::new_v4();
        Self {
            id,
            email: format!("test-{}@example.com", id),
            username: format!("testuser_{}", id),
            password: "TestPass123!".to_string(),
        }
    }
}

impl Default for TestUser {
    fn default() -> Self {
        Self::new()
    }
}

pub struct TestAgent {
    pub id: Uuid,
    pub name: String,
    pub url: String,
    pub token: String,
}

impl TestAgent {
    pub fn new() -> Self {
        let id = Uuid::new_v4();
        Self {
            id,
            name: format!("test-agent-{}", id),
            url: "http://localhost:8080".to_string(),
            token: format!("token-{}", id),
        }
    }
}

impl Default for TestAgent {
    fn default() -> Self {
        Self::new()
    }
}

pub fn generate_test_email() -> String {
    format!("test-{}@example.com", Uuid::new_v4())
}

pub fn generate_test_username() -> String {
    format!("testuser_{}", Uuid::new_v4())
}

pub fn generate_test_password() -> String {
    "TestPass123!".to_string()
}
