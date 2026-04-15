use eyre::Result;

pub async fn run_agent(server: String, token: String) -> Result<()> {
    println!("Starting agent mode...");
    println!("Connecting to: {}", server);
    crate::client::run_agent(server, token).await
}
