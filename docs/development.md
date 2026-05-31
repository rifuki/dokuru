# Development

## Local Development

### Prerequisites

- Rust `1.95.0`, pinned by `rust-toolchain.toml`.
- Bun `1.3+`.
- Docker `24+` with Compose v2.
- PostgreSQL and Redis through Compose for local server work.
- Linux host with Docker for realistic agent testing.

### Commands

Backend:

```bash
docker compose up -d dokuru-db dokuru-redis
cd dokuru-server
cargo run
cargo test
cargo clippy -- -D warnings
```

Dashboard:

```bash
cd dokuru-www
bun install
VITE_DOKURU_MODE=cloud VITE_API_BASE_URL=http://localhost:9393 bun run dev
bun run lint
bun run build
```

Landing site:

```bash
cd dokuru-landing
bun install
bun run dev
bun run lint
bun run build
```

Agent:

```bash
cd dokuru-www
VITE_DOKURU_MODE=agent bun run build

cd ../dokuru-agent
cargo build
cargo test
cargo clippy -- -D warnings
sudo ./target/debug/dokuru onboard --skip-service
sudo ./target/debug/dokuru serve
```

Deploy helper:

```bash
cd dokuru-deploy
cargo build
cargo test
cargo clippy -- -D warnings
```

### Testing Notes

- `dokuru-agent` has unit and integration tests for audit types, registry behavior, Docker operations, auth, WebSocket contracts, and API integration.
- `dokuru-server` has unit tests plus integration-style tests for auth, Redis, database, and WebSocket paths. Some integration tests are ignored unless the required infrastructure is running.
- `dokuru-www` currently has lint/build coverage but no dedicated test script.
- `dokuru-landing` is validated through Rust checks plus Trunk/Tailwind builds.
- `dokuru-deploy` has Rust unit tests and is included in workspace lint/test CI.
- CI builds `dokuru-www` in agent mode before Rust agent tests so embedded UI behavior is exercised at build time.

## CI And Releases


| Workflow | Purpose |
| --- | --- |
| `ci.yaml` | Web lint/build, Rust fmt/clippy/test for agent, server, and deploy crates. |
| `build-server.yaml` | Builds `dokuru-server` and `dokuru-server-migrate` GHCR images. |
| `build-www.yaml` | Builds the hosted dashboard image. |
| `build-landing.yaml` | Builds the public landing image. |
| `release-agent.yaml` | Builds Linux AMD64/ARM64 `dokuru` agent binaries with embedded dashboard assets and publishes installer/checksum release assets. |
| `release-deploy.yaml` | Builds and publishes `dokuru-deploy` binaries. |
| `deploy-compose-service.yaml` | Reusable production Compose service deployment workflow. |
| `toggle-compose-auto-deploy.yaml` | Enables or disables Compose auto-deploy behavior. |

Release assets produced for the agent include rolling `latest` names and versioned stable names:

- `dokuru-linux-amd64` or `dokuru-linux-amd64-vX.Y.Z`
- `dokuru-linux-arm64` or `dokuru-linux-arm64-vX.Y.Z`
- `install.sh`
- `SHA256SUMS`
- `version.json`
