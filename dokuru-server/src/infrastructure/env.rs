use std::path::PathBuf;

pub fn load() {
    let api_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_dir = api_dir.parent().expect("api dir must be in workspace");

    // Load api/.env first (default)
    let api_env = api_dir.join(".env");
    if api_env.exists() {
        dotenvy::from_path(&api_env).expect("Failed to load .env file in api directory");
        println!("Loaded: {}", api_env.display());
    }

    // Override with workspace/.env if exists
    let workspace_env = workspace_dir.join(".env");
    if workspace_env.exists() {
        dotenvy::from_path(&workspace_env)
            .expect("Failed to load .env file in workspace directory");
        println!("Overridden by: {}", workspace_env.display());
    }
}
