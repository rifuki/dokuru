use super::super::types::*;
use eyre::Result;

pub fn run_configure(args: SetupArgs) -> Result<()> {
    // Configure is just onboard with Configure mode
    super::onboard::run(SetupMode::Configure, args)
}
