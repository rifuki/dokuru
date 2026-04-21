use eyre::Result;
use serde::Serialize;

use crate::infrastructure::config::EmailConfig;

const VERIFY_EMAIL_TEMPLATE: &str = include_str!("../../templates/email/verify_email.html");
const RESET_PASSWORD_TEMPLATE: &str = include_str!("../../templates/email/reset_password.html");

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
        let html = VERIFY_EMAIL_TEMPLATE.replace("{{verification_url}}", verification_url);
        self.send_email(to, "Verify Your Email - Dokuru", &html)
            .await
    }

    pub async fn send_password_reset_email(&self, to: &str, reset_url: &str) -> Result<()> {
        let html = RESET_PASSWORD_TEMPLATE.replace("{{reset_url}}", reset_url);
        self.send_email(to, "Reset Your Password - Dokuru", &html)
            .await
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
