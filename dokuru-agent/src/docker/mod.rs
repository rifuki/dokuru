pub mod containers;
pub mod events;
pub mod images;
pub mod networks;
pub mod stacks;
pub mod volumes;

#[cfg(test)]
mod containers_tests;
#[cfg(test)]
mod operations_tests;

use bollard::Docker;
use eyre::Result;

pub fn get_docker_client() -> Result<Docker> {
    Docker::connect_with_local_defaults()
        .map_err(|e| eyre::eyre!("Failed to connect to Docker: {}", e))
}
