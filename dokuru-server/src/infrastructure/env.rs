use std::path::PathBuf;

pub fn load() {
    let pkg_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_dir = pkg_dir.parent().expect("package dir must be in workspace");

    // Load package-level .env first (default)
    let pkg_env = pkg_dir.join(".env");
    if pkg_env.exists() {
        dotenvy::from_path(&pkg_env).expect("Failed to load .env file in package directory");
        println!("Loaded: {}", pkg_env.display());
    }

    // Override with workspace-level .env if exists
    let workspace_env = workspace_dir.join(".env");
    if workspace_env.exists() {
        dotenvy::from_path(&workspace_env)
            .expect("Failed to load .env file in workspace directory");
        println!("Overridden by: {}", workspace_env.display());
    }
}
