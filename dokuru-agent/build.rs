use std::{
    env,
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

fn main() {
    println!("cargo:rerun-if-env-changed=DOKURU_AGENT_GIT_SHA");
    println!("cargo:rerun-if-env-changed=DOKURU_AGENT_GIT_REF");
    println!("cargo:rerun-if-env-changed=DOKURU_AGENT_BUILD_TIME");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_REF_NAME");
    register_git_rerun_paths();
    generate_embedded_www();

    let git_sha = env_value("DOKURU_AGENT_GIT_SHA")
        .or_else(|| env_value("GITHUB_SHA"))
        .or_else(|| git_output(["rev-parse", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_string());
    let git_hash = git_sha.get(..7).unwrap_or(&git_sha).to_string();
    let git_ref = env_value("DOKURU_AGENT_GIT_REF")
        .or_else(|| env_value("GITHUB_REF_NAME"))
        .or_else(|| git_output(["rev-parse", "--abbrev-ref", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_string());
    let git_tag =
        git_output(["describe", "--tags", "--abbrev=0"]).unwrap_or_else(|| "v0.1.0".to_string());
    let build_time = env_value("DOKURU_AGENT_BUILD_TIME").unwrap_or_else(|| "unknown".to_string());
    let target = env::var("TARGET").unwrap_or_else(|_| "unknown".to_string());

    println!("cargo:rustc-env=GIT_HASH={git_hash}");
    println!("cargo:rustc-env=GIT_TAG={git_tag}");
    println!("cargo:rustc-env=DOKURU_AGENT_GIT_SHA={git_sha}");
    println!("cargo:rustc-env=DOKURU_AGENT_GIT_REF={git_ref}");
    println!("cargo:rustc-env=DOKURU_AGENT_BUILD_TIME={build_time}");
    println!("cargo:rustc-env=DOKURU_AGENT_TARGET={target}");
}

fn generate_embedded_www() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is set by Cargo"));
    let generated = out_dir.join("embedded_www.rs");
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by Cargo"));
    let dist_dir = manifest_dir.join("..").join("dokuru-www").join("dist");
    let www_dir = manifest_dir.join("..").join("dokuru-www");

    println!("cargo:rerun-if-changed={}", dist_dir.display());
    println!("cargo:rerun-if-changed={}", www_dir.join("src").display());
    println!(
        "cargo:rerun-if-changed={}",
        www_dir.join("package.json").display()
    );

    // Check if dist needs rebuilding or doesn't exist
    let needs_build =
        !dist_dir.join("index.html").exists() || needs_www_rebuild(&www_dir, &dist_dir);

    if needs_build {
        build_www(&www_dir);
    }

    let files = if dist_dir.join("index.html").exists() {
        collect_files(&dist_dir)
    } else {
        let fallback_dir = out_dir.join("embedded-www-fallback");
        fs::create_dir_all(&fallback_dir).expect("create embedded www fallback dir");
        let fallback_index = fallback_dir.join("index.html");
        fs::write(
            &fallback_index,
            "<!doctype html><title>Dokuru Agent</title><body><h1>Dokuru Agent UI not embedded</h1><p>Failed to build dokuru-www. Make sure bun is installed and try rebuilding.</p></body>",
        )
        .expect("write embedded www fallback");
        vec![("index.html".to_string(), fallback_index)]
    };

    let mut source = String::from("static EMBEDDED_WWW_ASSETS: &[(&str, &str, &[u8])] = &[\n");

    for (route, file) in files {
        let mime = mime_for(&route);
        let file = file.to_string_lossy().replace('\\', "\\\\");
        writeln!(
            &mut source,
            "    (\"/{route}\", \"{mime}\", include_bytes!(r#\"{file}\"#)),"
        )
        .expect("write embedded asset route");
        if route == "index.html" {
            writeln!(
                &mut source,
                "    (\"/\", \"{mime}\", include_bytes!(r#\"{file}\"#)),"
            )
            .expect("write embedded index route");
        }
    }

    source.push_str(
        "];\n\npub fn embedded_www_asset(path: &str) -> Option<(&'static str, &'static [u8])> {\n    EMBEDDED_WWW_ASSETS\n        .iter()\n        .find(|(asset_path, _, _)| *asset_path == path)\n        .map(|(_, content_type, bytes)| (*content_type, *bytes))\n}\n",
    );
    fs::write(generated, source).expect("write embedded www source");
}

fn needs_www_rebuild(www_dir: &Path, dist_dir: &Path) -> bool {
    if !dist_dir.exists() {
        return true;
    }

    let dist_mtime = fs::metadata(dist_dir)
        .and_then(|m| m.modified())
        .unwrap_or_else(|_| std::time::SystemTime::UNIX_EPOCH);

    let src_dir = www_dir.join("src");
    let package_json = www_dir.join("package.json");
    let vite_config = www_dir.join("vite.config.ts");

    for path in [&src_dir, &package_json, &vite_config] {
        if path.exists() {
            let file_mtime = fs::metadata(path)
                .and_then(|m| m.modified())
                .unwrap_or_else(|_| std::time::SystemTime::UNIX_EPOCH);

            if file_mtime > dist_mtime {
                return true;
            }
        }
    }

    false
}

fn build_www(www_dir: &Path) {
    let bun_path = which_bun().unwrap_or_else(|| "bun".to_string());

    println!("cargo:warning=Building dokuru-www with VITE_DOKURU_MODE=agent...");

    let output = Command::new(&bun_path)
        .arg("install")
        .arg("--frozen-lockfile")
        .current_dir(www_dir)
        .output();

    if let Err(e) = output {
        println!(
            "cargo:warning=Failed to run 'bun install': {}. Continuing with build...",
            e
        );
        return;
    }

    let build_output = Command::new(&bun_path)
        .arg("run")
        .arg("build")
        .current_dir(www_dir)
        .env("VITE_DOKURU_MODE", "agent")
        .output();

    match build_output {
        Ok(output) => {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("cargo:warning=dokuru-www build failed:\n{}", stderr);
            } else {
                println!("cargo:warning=dokuru-www built successfully");
            }
        }
        Err(e) => {
            println!("cargo:warning=Failed to build dokuru-www: {}", e);
        }
    }
}

fn which_bun() -> Option<String> {
    let output = Command::new("which").arg("bun").output().ok()?;
    if output.status.success() {
        String::from_utf8(output.stdout)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        None
    }
}

fn collect_files(root: &Path) -> Vec<(String, PathBuf)> {
    let mut files = Vec::new();
    collect_files_inner(root, root, &mut files);
    files.sort_by(|a, b| a.0.cmp(&b.0));
    files
}

fn collect_files_inner(root: &Path, dir: &Path, files: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files_inner(root, &path, files);
        } else if path.is_file() {
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            let route = relative.to_string_lossy().replace('\\', "/");
            println!("cargo:rerun-if-changed={}", path.display());
            files.push((route, path));
        }
    }
}

fn mime_for(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
    {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "wasm" => "application/wasm",
        "pdf" => "application/pdf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
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
