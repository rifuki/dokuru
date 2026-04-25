use eyre::Result;

pub async fn run_serve() -> Result<()> {
    println!("Starting local API server...");
    Box::pin(crate::api::serve()).await
}
