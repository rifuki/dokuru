#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.cargo/bin:$PWD:$PATH"

if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi

rustup target add wasm32-unknown-unknown

trunk_version="${TRUNK_VERSION:-0.21.14}"
case "$(uname -m)" in
  x86_64 | amd64) trunk_arch="x86_64" ;;
  aarch64 | arm64) trunk_arch="aarch64" ;;
  *)
    echo "unsupported build architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

case "$(uname -s)" in
  Linux) trunk_target="unknown-linux-gnu" ;;
  Darwin) trunk_target="apple-darwin" ;;
  *)
    echo "unsupported build OS: $(uname -s)" >&2
    exit 1
    ;;
esac

curl --proto '=https' --tlsv1.2 -LsSf "https://github.com/trunk-rs/trunk/releases/download/v${trunk_version}/trunk-${trunk_arch}-${trunk_target}.tar.gz" | tar -xz
bun run build
