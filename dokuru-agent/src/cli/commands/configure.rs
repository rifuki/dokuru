use super::super::helpers::{resolve_config, run_configure_sections};
use super::super::types::SetupArgs;
use cliclack::{intro, outro};
use eyre::Result;

pub fn run_configure(args: SetupArgs) -> Result<()> {
    let mut config = resolve_config(args);

    intro("🐳 Dokuru configure")?;

    // Run interactive configuration loop
    run_configure_sections(&mut config)?;

    // Done - no need to apply anything, already applied in each section
    outro("Dokuru is ready.")?;

    Ok(())
}
