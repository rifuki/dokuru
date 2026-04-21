use super::super::helpers::{load_saved_runtime_config, nix_like_is_root, resolve_shared_config};
use super::super::types::SharedArgs;
use cliclack::{intro, note, outro, outro_cancel};
use eyre::{Result, bail};

pub fn run_token_show(shared: &SharedArgs) -> Result<()> {
    intro("🔑 Dokuru  token show")?;

    let config = resolve_shared_config(shared, None)?;
    let runtime_config = load_saved_runtime_config(&config.config_dir)?;

    if runtime_config.auth.token_hash.is_empty() {
        outro_cancel("No token configured. Run 'dokuru configure' to generate one.")?;
        bail!("no token configured");
    }

    note(
        "Agent Token",
        format!(
            "Token hash: {}\n\nNote: The raw token was shown once during onboard/configure.\n      Use 'dokuru token rotate' to generate a new one.",
            runtime_config.auth.token_hash
        ),
    )?;

    outro("Token information displayed.")?;
    Ok(())
}

pub fn run_token_rotate(shared: &SharedArgs) -> Result<()> {
    intro("🔄 Dokuru  token rotate")?;

    // Check if running as root
    if !nix_like_is_root() {
        outro_cancel("Token rotation requires root privileges. Run with sudo.")?;
        bail!("not running as root");
    }

    let config = resolve_shared_config(shared, None)?;
    rotate_token_impl(&config)?;
    outro("Token rotated successfully.")?;
    Ok(())
}

pub fn rotate_token_impl(config: &super::super::helpers::InstallerConfig) -> Result<String> {
    use super::super::helpers::{
        generate_agent_token, hash_token, restart_service, run_step, write_config_file,
    };

    // Generate new token
    let new_token = generate_agent_token();
    let new_hash = hash_token(&new_token);

    run_step("Generating new token", || Ok(()))?;
    run_step("Updating configuration", || {
        write_config_file(config, Some(new_hash))
    })?;

    cliclack::log::info(format!("→ {}/config.toml", config.config_dir.display()))?;

    // Restart service if it exists
    if config
        .systemd_dir
        .join(format!("{}.service", config.service_name))
        .exists()
    {
        run_step("Restarting Dokuru service", || {
            restart_service(&config.service_name)
        })?;
        cliclack::log::info(format!("→ systemctl restart {}", config.service_name))?;
    }

    note(
        "New Token",
        format!(
            "{new_token}\n\n→ Update this token in your Dokuru dashboard.\n   The old token is now invalid."
        ),
    )?;

    Ok(new_token)
}
