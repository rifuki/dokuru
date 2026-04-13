use std::path::PathBuf;

pub fn load() {
    // 1. Production env (/etc/dokuru/.env)
    let prod_env = PathBuf::from("/etc/dokuru/.env");
    if prod_env.exists() {
        dotenvy::from_path(&prod_env).ok();
        println!("Loaded: {}", prod_env.display());
        return;
    }

    // 2. Local dev env
    if let Ok(workspace_dir) = std::env::current_dir() {
        let local_env = workspace_dir.join(".env");
        if local_env.exists() {
            dotenvy::from_path(&local_env).ok();
            println!("Loaded: {}", local_env.display());
        }
    }
}
