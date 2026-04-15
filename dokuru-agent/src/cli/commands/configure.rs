use super::super::helpers::*;
use super::super::types::*;
use cliclack::{confirm, intro, note, outro, outro_cancel};
use eyre::{Result, WrapErr, bail};
use std::io::{IsTerminal, stderr};
use std::path::PathBuf;

pub fn run_configure(args: SetupArgs) -> Result<()> {
    // Configure is just onboard with Configure mode
    super::onboard::run(SetupMode::Configure, args)
}
