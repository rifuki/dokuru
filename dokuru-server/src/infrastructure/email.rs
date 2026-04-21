use eyre::Result;
use serde::Serialize;

use crate::infrastructure::config::EmailConfig;

#[derive(Clone)]
pub struct EmailService {
    config: EmailConfig,
    client: reqwest::Client,
}

#[derive(Serialize)]
struct ResendEmail {
    from: String,
    to: Vec<String>,
    subject: String,
    html: String,
}

impl EmailService {
    pub fn new(config: EmailConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
        }
    }

    pub async fn send_verification_email(&self, to: &str, verification_url: &str) -> Result<()> {
        let html = format!(
            r#"
            <h2>Verify your email</h2>
            <p>Click the link below to verify your email address:</p>
            <a href="{verification_url}">{verification_url}</a>
            <p>This link will expire in 24 hours.</p>
            "#
        );

        self.send_email(to, "Verify your email", &html).await
    }

    pub async fn send_password_reset_email(&self, to: &str, reset_url: &str) -> Result<()> {
        let html = format!(
            r#"
            <h2>Reset your password</h2>
            <p>Click the link below to reset your password:</p>
            <a href="{reset_url}">{reset_url}</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
            "#
        );

        self.send_email(to, "Reset your password", &html).await
    }

    async fn send_email(&self, to: &str, subject: &str, html: &str) -> Result<()> {
        let email = ResendEmail {
            from: self.config.from_email.clone(),
            to: vec![to.to_string()],
            subject: subject.to_string(),
            html: html.to_string(),
        };

        let response = self
            .client
            .post("https://api.resend.com/emails")
            .header(
                "Authorization",
                format!("Bearer {}", self.config.resend_api_key),
            )
            .json(&email)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            eyre::bail!("Failed to send email: {}", error_text);
        }

        Ok(())
    }
}
