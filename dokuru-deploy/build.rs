use std::{env, fs, path::Path, process::Command};

fn main() {
    println!("cargo:rerun-if-env-changed=DOKURU_DEPLOY_GIT_SHA");
    println!("cargo:rerun-if-env-changed=DOKURU_DEPLOY_GIT_REF");
    println!("cargo:rerun-if-env-changed=DOKURU_DEPLOY_BUILD_TIME");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_REF_NAME");
    register_git_rerun_paths();

    let git_sha = env_value("DOKURU_DEPLOY_GIT_SHA")
        .or_else(|| env_value("GITHUB_SHA"))
        .or_else(|| git_output(["rev-parse", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_string());
    let git_ref = env_value("DOKURU_DEPLOY_GIT_REF")
        .or_else(|| env_value("GITHUB_REF_NAME"))
        .or_else(|| git_output(["rev-parse", "--abbrev-ref", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_string());
    let build_time = env_value("DOKURU_DEPLOY_BUILD_TIME").unwrap_or_else(|| "unknown".to_string());
    let target = env::var("TARGET").unwrap_or_else(|_| "unknown".to_string());

    println!("cargo:rustc-env=DOKURU_DEPLOY_GIT_SHA={git_sha}");
    println!("cargo:rustc-env=DOKURU_DEPLOY_GIT_REF={git_ref}");
    println!("cargo:rustc-env=DOKURU_DEPLOY_BUILD_TIME={build_time}");
    println!("cargo:rustc-env=DOKURU_DEPLOY_TARGET={target}");
}

fn register_git_rerun_paths() {
    let Some(manifest_dir) = env_value("CARGO_MANIFEST_DIR") else {
        return;
    };
    let git_dir = Path::new(&manifest_dir).join("..").join(".git");
    let head_path = git_dir.join("HEAD");
    println!("cargo:rerun-if-changed={}", head_path.display());

    let Ok(head) = fs::read_to_string(&head_path) else {
        return;
    };
    let Some(ref_name) = head.trim().strip_prefix("ref: ") else {
        return;
    };

    println!(
        "cargo:rerun-if-changed={}",
        git_dir.join(ref_name).display()
    );
}

fn env_value(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn git_output<const N: usize>(args: [&str; N]) -> Option<String> {
    let output = Command::new("git").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8(output.stdout)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}
