use eyre::Result;

pub async fn run_serve() -> Result<()> {
    println!("Starting local API server...");
    crate::api::serve().await
}
