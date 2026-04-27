use std::{
    io::{Read, Write},
    path::Path,
    sync::mpsc as std_mpsc,
};

use eyre::Result;
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use tokio::sync::mpsc;

const HOST_SHELL_PRIORITY: &[&str] = &["/bin/zsh", "/bin/bash", "/bin/sh"];

pub struct HostShellSession {
    input_tx: std_mpsc::Sender<Vec<u8>>,
    output_rx: mpsc::UnboundedReceiver<Vec<u8>>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

pub fn detect_shell(preferred: Option<&str>) -> String {
    if let Some(shell) = preferred
        && is_allowed_shell(shell)
        && is_executable(shell)
    {
        return shell.to_string();
    }

    HOST_SHELL_PRIORITY
        .iter()
        .find(|shell| is_executable(shell))
        .copied()
        .unwrap_or("/bin/sh")
        .to_string()
}

pub fn start(
    rows: u16,
    cols: u16,
    preferred_shell: Option<&str>,
) -> Result<(String, HostShellSession)> {
    let shell = detect_shell(preferred_shell);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| eyre::eyre!("Failed to allocate host pty: {error}"))?;

    let mut command = CommandBuilder::new(&shell);
    command.env("TERM", "xterm-256color");
    command.env("DOKURU_HOST_SHELL", "1");

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| eyre::eyre!("Failed to spawn host shell: {error}"))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| eyre::eyre!("Failed to clone host shell reader: {error}"))?;
    let mut writer = pair
        .master
        .take_writer()
        .map_err(|error| eyre::eyre!("Failed to take host shell writer: {error}"))?;

    let (output_tx, output_rx) = mpsc::unbounded_channel();
    std::thread::spawn(move || {
        let mut buf = [0_u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if output_tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    let (input_tx, input_rx) = std_mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        for data in input_rx {
            if writer.write_all(&data).is_err() {
                break;
            }
            let _ = writer.flush();
        }
    });

    Ok((
        shell,
        HostShellSession {
            input_tx,
            output_rx,
            master: pair.master,
            child,
        },
    ))
}

impl HostShellSession {
    pub async fn recv_output(&mut self) -> Option<Vec<u8>> {
        self.output_rx.recv().await
    }

    pub fn send_input(&self, data: Vec<u8>) -> Result<()> {
        self.input_tx
            .send(data)
            .map_err(|_| eyre::eyre!("Host shell input closed"))
    }

    pub fn resize(&self, rows: u16, cols: u16) {
        let _ = self.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        });
    }

    pub fn shutdown(mut self) {
        let _ = self.child.kill();
    }
}

fn is_allowed_shell(shell: &str) -> bool {
    HOST_SHELL_PRIORITY.contains(&shell)
}

#[cfg(unix)]
fn is_executable(path: &str) -> bool {
    use std::os::unix::fs::PermissionsExt;

    std::fs::metadata(Path::new(path))
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable(path: &str) -> bool {
    Path::new(path).is_file()
}
