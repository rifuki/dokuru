<div align="center">

# Dokuru

**Docker Security Hardening & Compliance Platform**
Based on CIS Docker Benchmark v1.8.0

[![Quality Gate](https://github.com/rifuki/dokuru/actions/workflows/ci.yaml/badge.svg)](https://github.com/rifuki/dokuru/actions/workflows/ci.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Audit, auto-fix, and monitor Docker hosts from one dashboard — without rewriting your apps.

</div>

---

## Why Dokuru

Docker defaults are reasonable for most workloads, but real incidents come from runtime **misconfigurations**: shared host namespaces (`pid`, `ipc`, `uts`, `userns`), missing cgroup limits, extra capabilities, world-writable sockets. Dokuru turns the CIS Docker Benchmark into an always-on workflow:

- **Detect** — 36 auto-audited rules across sections 1–5 of CIS Docker Benchmark v1.8.0.
- **Preview** — show the target containers, strategy (`docker_update`, `compose_update`, `recreate`), and suggested limits before anything changes.
- **Apply** — idempotent fixes with per-step progress streams over WebSocket.
- **Roll back** — YAML backups and previous cgroup snapshots are captured before every apply.
- **Prove** — `dokuru-lab` (a sister project) exists purely to validate the flow end-to-end, from misconfigured baseline to hardened state.

## Architecture

```mermaid
graph TB
    subgraph User["👤 Users"]
        Browser[Web Browser]
    end

    subgraph Edge["🌐 Edge"]
        Traefik[Traefik + Let's Encrypt]
    end

    subgraph Frontend["🎨 Frontend"]
        Landing[dokuru-landing<br/>Leptos WASM]
        WWW[dokuru-www<br/>React 19 + TanStack]
    end

    subgraph Backend["🦀 Backend"]
        Server[dokuru-server<br/>Axum + JWT + WS Relay]
        PG[(PostgreSQL 16)]
        Redis[(Redis 7)]
    end

    subgraph Agents["🛡️ Docker Hosts"]
        Agent1[dokuru-agent<br/>Bollard + 36 CIS Rules]
        Docker1[Docker Engine]
        Agent2[dokuru-agent]
        Docker2[Docker Engine]
    end

    Browser -->|HTTPS| Traefik
    Traefik --> Landing
    Traefik --> WWW
    Traefik --> Server

    WWW -->|REST + WS| Server
    WWW -.->|Direct mode| Agent1

    Server --> PG
    Server --> Redis
    Server <-->|Relay WSS| Agent1
    Server <-->|Relay WSS| Agent2

    Agent1 --> Docker1
    Agent2 --> Docker2

    classDef frontend fill:#bbdefb,stroke:#1565c0
    classDef backend fill:#90caf9,stroke:#0d47a1
    classDef agent fill:#ffccbc,stroke:#bf360c
    classDef data fill:#c8e6c9,stroke:#1b5e20
    class Landing,WWW frontend
    class Server backend
    class Agent1,Agent2 agent
    class PG,Redis data
```

**Connection modes** between `dokuru-www` and `dokuru-agent`:

| Mode | Path | When to use |
|---|---|---|
| **Direct** | Browser → Agent `http(s)://host:9494` | LAN or when the agent has a routable URL |
| **Cloudflare** | Browser → Agent via `*.trycloudflare.com` | No domain, free TLS |
| **Relay** | Browser → Server → Agent over `wss://api/ws/agent` | Agent behind NAT/firewall |
| **Domain** | Browser → Agent via user's domain | Custom TLS proxy (future) |

## Components

This repo is a monorepo of six Rust/TypeScript projects plus a sister lab repo:

| Path | Language | Purpose |
|---|---|---|
| [`dokuru-agent/`](./dokuru-agent) | Rust + Bollard | Per-host audit engine, auto-fix, PTY host shell, relay client |
| [`dokuru-server/`](./dokuru-server) | Rust + Axum | REST API, WebSocket relay, JWT auth, PostgreSQL + Redis |
| [`dokuru-www/`](./dokuru-www) | React 19 + TypeScript | Dashboard, FixWizard, terminal, live audit stream |
| [`dokuru-landing/`](./dokuru-landing) | Rust + Leptos (WASM) | Marketing site at `dokuru.rifuki.dev` |
| [`dokuru-core/`](./dokuru-core) | Rust library | Shared audit types + scoring (`AuditViewReport`, `RemediationPlan`, pillars) |
| [`dokuru-deploy/`](./dokuru-deploy) | Rust CLI | VPS deployment orchestrator (`init`, `deploy`, `up`, `migrate`, `config`, …) |

Sister project (separate working tree): **[`dokuru-lab`](../dokuru-lab)** — a deliberately vulnerable SvelteKit + Compose stack used to demonstrate every fix with a before/after narrative (cryptominer, memory blast, secret theft via `SYS_PTRACE`, reverse-proxy sabotage).

## CIS Coverage

36 rules implemented across all 5 sections. Auto-fix where the host, Docker, or Compose layer can safely apply the change; guided remediation where human judgement is required.

| Section | Scope | Rules | Auto | Guided |
|---|---|---:|---:|---:|
| 1 | Host Configuration (partition + auditd) | 14 | 13 | 1 |
| 2 | Docker Daemon | 2 | 1 (`2.10` userns-remap) | 1 |
| 3 | Daemon File Permissions | 8 | 8 | 0 |
| 4 | Container Images | 2 | 2 (`4.1` user override, `4.6` healthcheck override) | 0 |
| 5 | Container Runtime | 10 | 8 | 2 |

Runtime rules are the backbone of the demo lab:

- **5.5** Privileged → recreate without `--privileged`
- **5.10** Network ns → remove `--network=host`
- **5.11** Memory limit → set `mem_limit` or `docker update --memory`
- **5.12** CPU priority → set `cpu_shares`
- **5.16** PID ns → remove `--pid=host`
- **5.17** IPC ns → set `--ipc=private`
- **5.21** UTS ns → remove `--uts=host`
- **5.25** Cgroup confinement (guided)
- **5.29** PIDs limit → set `--pids-limit`
- **5.31** User ns per-container → remove `--userns=host`

Fix pipeline lives in [`dokuru-agent/src/audit/fix_helpers.rs`](./dokuru-agent/src/audit/fix_helpers.rs):

```mermaid
flowchart LR
    A([FixRequest]) --> B{Rule family}
    B -->|5.11/5.12/5.29| C[cgroup_resource_fix]
    B -->|5.10/5.16/5.17/5.21/5.31| D[namespace_fix]
    B -->|5.5| E[privileged_fix]
    B -->|1.1.1| O[docker_root_partition_fix]
    B -->|1.1.3-1.1.18| F[audit_rule_fix]
    B -->|2.10| G[userns_remap_fix]
    C --> H{Compose-managed?}
    H -->|Yes| I[Edit YAML + backup + compose up]
    H -->|No| J[docker update live]
    D --> K[Stop + remove + recreate]
    E --> K
    F --> L[Write /etc/audit/rules.d + reload]
    G --> M[9-step: dockremap + subuid/subgid<br/>+ daemon.json + restart + migrate volumes]
    O --> P[Guarded LVM migration<br/>+ rsync + fstab + Docker restart]
    I --> N[Record FixHistoryEntry<br/>with RollbackPlan]
    J --> N
    K --> N
    L --> N
    M --> N
    P --> N
```

## Quick Start

### 1. Deploy the server stack (VPS, full-VPS strategy)

```bash
# Install the deploy CLI
curl -fsSL https://dokuru.rifuki.dev/deploy | bash
export PATH="$HOME/.local/bin:$PATH"

# Clone and generate config interactively
dokuru-deploy init --clone-if-missing --output ~/apps/dokuru
cd ~/apps/dokuru

# Pull images, start infra, run migrations, roll out apps
dokuru-deploy deploy
dokuru-deploy health --production --domain dokuru.rifuki.dev
```

Generated files (all in `~/apps/dokuru`):

```
.env                           # VERSION tag, DB credentials
docker-compose.override.yaml   # Traefik labels per chosen strategy
dokuru-server/.env             # PORT alias for Render-style hosts
dokuru-server/config/local.toml     # non-secret runtime values
dokuru-server/config/secrets.toml   # DB url, JWT secrets, Resend API key
```

Supported deploy strategies: `full-vps`, `landing-vercel`, `app-vercel`, `both-vercel`, `custom` (each toggles Traefik or Vercel per service).

### 2. Install an agent on a Docker host

```bash
curl -fsSL https://dokuru.rifuki.dev/install | sudo bash
# Onboarding wizard will ask for access mode (Direct / Cloudflare / Relay / Domain),
# generate a dok_<token>, install systemd unit, and start the service.
```

After onboarding, add the agent from the dashboard using the printed `Agent URL` + `Token`.

### 3. (Optional) Spin up `dokuru-lab` to demo the full flow

```bash
git clone https://github.com/rifuki/dokuru-lab ~/dokuru-lab
cd ~/dokuru-lab
docker compose up --build -d
./scripts/reset-demo.sh    # restore vulnerable baseline
# Run Dokuru audit against the lab host → score ~37/100
# Apply rule 5.16 → secret-theft payload blocked
# Apply rule 5.11 → memory-blast contained within the attacker container
```

Full runbook: [`../dokuru-lab/demo.md`](../dokuru-lab/demo.md) and [`../dokuru-lab/plan.md`](../dokuru-lab/plan.md).

## Repository Layout

```
dokuru/
├── README.md                   ← you are here
├── docker-compose.yaml         ← production stack (Traefik + db + redis + apps)
├── rust-toolchain.toml         ← pinned Rust 1.95.0
├── .github/workflows/          ← CI: build-landing, build-www, build-server,
│                                 release-agent, release-deploy,
│                                 deploy-compose-service, toggle-compose-auto-deploy,
│                                 ci.yaml, quality-gate
├── dokuru-core/                ← shared audit types (lib)
│   └── src/audit/mod.rs          CisRule, CheckResult, AuditViewReport,
│                                 RemediationPlan, SecurityPillar, score_band
├── dokuru-agent/               ← the audit engine
│   ├── dokuru-agent.service      systemd unit
│   ├── install.sh                installer (checksum-verified GHCR binary)
│   └── src/
│       ├── main.rs               CLI: onboard/configure/doctor/status/serve/…
│       ├── api/                  direct mode routes + relay WebSocket client
│       │   ├── feature/          audit, containers, environments, fix, health,
│       │   │                     host_shell, info, proxy, rules, trivy, ws
│       │   ├── infrastructure/   config, logging, server, web (auth, cors, …)
│       │   ├── relay.rs          wss://api.dokuru.rifuki.dev/ws/agent client
│       │   └── relay_docker.rs   Docker HTTP proxy for dokuru-www
│       ├── audit/
│       │   ├── types.rs          CisRule, CheckResult, FixOutcome, …
│       │   ├── fix_helpers.rs    ≈4 200 LOC — every fix, rollback, compose edit
│       │   └── rule_registry/    section1..section5 rule definitions
│       ├── cli/                  commands + Cloudflare Tunnel integration
│       ├── docker/               Bollard wrappers per resource
│       └── host_shell.rs         portable-pty host shell (zsh/bash/sh)
├── dokuru-server/              ← REST API + WS relay
│   ├── Dockerfile                cargo-chef → scratch runtime
│   ├── Dockerfile.migrate        standalone sqlx migration image
│   ├── migrations/               10 SQL files (users, auth_methods, sessions,
│   │                             api_keys, agents, audit_results, documents,
│   │                             notifications, notification_preferences)
│   ├── config/                   defaults.toml + local.toml + secrets.toml
│   ├── templates/email/          Resend HTML templates
│   └── src/
│       ├── main.rs               bootstrap + graceful shutdown
│       ├── routes.rs             /health, /ws, /ws/agent, /api/v1/*, /media/*
│       ├── state.rs              AppState: config, db, Redis blacklist,
│       │                         agent registry, WS manager
│       ├── bootstrap.rs          seed first admin + system notification
│       ├── websocket/            live dashboard events (agent:connected, …)
│       ├── feature/              admin, agent, audit_result, auth, document,
│       │                         health, notification, user
│       └── infrastructure/       config (TOML + env), email, logging,
│                                 persistence (sqlx, Redis), storage, web
├── dokuru-www/                 ← dashboard SPA
│   ├── Dockerfile                Bun build → nginx runtime
│   ├── vercel.json               alt deploy target
│   ├── plugins/env-validator.ts
│   └── src/
│       ├── main.tsx              TanStack Router bootstrap
│       ├── routes/               file-based routes with auto code-splitting
│       │   ├── _authenticated/     38 protected views (agents, audits, admin)
│       │   ├── login.tsx, register.tsx
│       │   ├── forgot-password.tsx, reset-password.tsx
│       │   └── verify-email*.tsx
│       ├── features/             admin, audit, auth, notifications, settings
│       ├── components/           41 shared UI building blocks (shadcn-style)
│       ├── stores/               Zustand: auth, agent, audit, host-shell
│       └── services/             API client, WebSocket helpers
├── dokuru-landing/             ← marketing site
│   ├── Trunk.toml                WASM bundler config
│   ├── Dockerfile                Rust + trunk + binaryen → nginx
│   └── src/
│       ├── main.rs               Leptos CSR entry
│       ├── content.rs            copy, features, FAQ data
│       ├── pages/landing.rs
│       ├── components/           reusable Leptos components
│       └── utils/                page_motion + scroll helpers
└── dokuru-deploy/              ← one-shot deployment CLI
    ├── install.sh                curl installer
    └── src/
        ├── main.rs               clap-driven init/deploy/up/pull/migrate/…
        ├── compose.rs            docker compose wrapper
        ├── generator.rs          TOML + docker-compose.override.yaml templates
        ├── ghcr.rs               GHCR login helper
        ├── project.rs            detect or clone project directory
        ├── release.rs            self-update from GitHub Releases
        └── runtime.rs            configure / export / import / repair
```

## Tech Stack

**Backend (`dokuru-server`)**
- [Axum 0.8](https://github.com/tokio-rs/axum) + [Tower](https://github.com/tower-rs/tower) middleware
- [SQLx 0.8](https://github.com/launchbadge/sqlx) (compile-time checked) → PostgreSQL 16
- [bb8-redis](https://github.com/djc/bb8) + [Redis 7](https://redis.io/) for session blacklist
- [jsonwebtoken](https://github.com/Keats/jsonwebtoken) + [Argon2id](https://github.com/RustCrypto/password-hashes) auth
- [tokio-tungstenite](https://github.com/snapview/tokio-tungstenite) for the agent relay
- [Resend](https://resend.com) for transactional email
- [tracing](https://tracing.rs) with file rotation

**Agent (`dokuru-agent`)**
- [Bollard 0.18](https://github.com/fussybeaver/bollard) Docker client
- [Clap 4](https://github.com/clap-rs/clap) + [Cliclack](https://github.com/fadeevab/cliclack) for the onboarding wizard
- [yaml-edit](https://crates.io/crates/yaml-edit) for lossless Compose YAML patches
- [portable-pty](https://github.com/wez/wezterm/tree/main/pty) for real host shell sessions
- [Axum 0.8](https://github.com/tokio-rs/axum) (direct mode) + tokio-tungstenite (relay mode)

**Frontend (`dokuru-www`)**
- [React 19](https://react.dev/) + [TypeScript 5.9](https://www.typescriptlang.org/)
- [TanStack Router](https://tanstack.com/router) with file-based auto code-splitting
- [TanStack Query](https://tanstack.com/query) for server state, [Zustand](https://zustand-demo.pmnd.rs/) for client state
- [Radix UI](https://www.radix-ui.com/) + [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn](https://ui.shadcn.com/)
- [xterm.js](https://xtermjs.org/) terminal, [Recharts](https://recharts.org/) charts, [react-pdf](https://github.com/wojtekmaj/react-pdf)
- [axios](https://github.com/axios/axios) + [react-use-websocket](https://github.com/robtaussig/react-use-websocket)

**Landing (`dokuru-landing`)**
- [Leptos 0.8](https://leptos.dev/) (CSR) + [Trunk 0.21](https://trunkrs.dev/)
- Tailwind CSS v4 via Bun

**Infrastructure**
- [Traefik](https://traefik.io/) reverse proxy with Let's Encrypt
- [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/) (optional agent access)
- [GitHub Container Registry](https://ghcr.io/) for images
- [GitHub Actions](https://github.com/features/actions) for CI/CD

## Development

Workspace-wide prerequisites:

- Rust **1.95.0** (pinned by `rust-toolchain.toml`)
- [Bun 1.3+](https://bun.sh) for frontend tooling
- Docker **24+** with Compose v2
- PostgreSQL 16 + Redis 7 (via `docker compose up dokuru-db dokuru-redis` with the `db` profile)

Per-component recipes:

```bash
# Backend
cd dokuru-server
docker compose --profile db up -d dokuru-db dokuru-redis
sqlx migrate run --source migrations
cargo run                      # http://localhost:9393
cargo test
cargo clippy -- -D warnings

# Frontend dashboard
cd dokuru-www
bun install
bun run dev                    # http://localhost:5173 (VITE_API_BASE_URL=http://localhost:9393)
bun run build
bun run lint

# Agent
cd dokuru-www
VITE_DOKURU_MODE=agent bun run build  # embeds the dashboard into the agent binary
cd dokuru-agent
cargo build --release
sudo ./target/release/dokuru onboard --skip-service    # local dev
sudo ./target/release/dokuru serve                      # http://localhost:3939
cargo test

# Landing
cd dokuru-landing
bun install
bun run dev                    # trunk serve on http://localhost:8080
bun run build

# Deploy CLI
cd dokuru-deploy
cargo build --release
./target/release/dokuru-deploy --help
```

## Configuration

`dokuru-server` and `dokuru-agent` both use the same layered config model:

1. **TOML defaults** shipped with the binary (`dokuru-server/config/defaults.toml`, `/etc/dokuru/config.toml`).
2. **TOML overrides** for the local machine (`local.toml`, `secrets.toml`).
3. **Environment variables** with the `DOKURU__SECTION__KEY` convention always win.

Commonly overridden values on the server:

```bash
DOKURU__APP__RUST_ENV=production
DOKURU__DATABASE__URL=postgres://dokuru:***@dokuru-db:5432/dokuru_db
DOKURU__REDIS__URL=redis://dokuru-redis:6379
DOKURU__AUTH__ACCESS_SECRET=<openssl rand -base64 32>
DOKURU__AUTH__REFRESH_SECRET=<openssl rand -base64 32>
DOKURU__SERVER__CORS_ALLOWED_ORIGINS=https://app.dokuru.rifuki.dev
DOKURU__EMAIL__RESEND_API_KEY=re_xxxxxxxx
DOKURU__UPLOAD__BASE_URL=https://api.dokuru.rifuki.dev/media
BOOTSTRAP_ADMIN_PASSWORD=***                     # only if you want a known seed password
```

The deploy CLI writes all of the above into `dokuru-server/config/secrets.toml` for you.

## API Surface

Public endpoints on `dokuru-server`:

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | liveness probe |
| `GET` | `/ws` | dashboard events (agent/audit/notification) |
| `GET` | `/ws/agent` | agent ↔ server relay channel |
| `POST` | `/api/v1/auth/register` | rate-limited 10/min |
| `POST` | `/api/v1/auth/login` | rate-limited 10/min |
| `POST` | `/api/v1/auth/logout` | blacklist session in Redis |
| `POST` | `/api/v1/auth/forgot-password` | Resend email |
| `GET` | `/api/v1/users/me` | current user profile |
| `GET/POST/DELETE` | `/api/v1/agents/*` | CRUD + run audit + run fix |
| `GET/DELETE` | `/api/v1/notifications/*` | list + mark read |
| `/api/v1/admin/*` | — | users, api-keys, documents, stats |
| `/api/v1/documents/*` | — | user-owned uploads |
| `/media/*` | — | static files from `uploads/` |

Agent endpoints (direct mode, port 9494) live under `/api/v1/*` and mirror what the server relays. Protected by SHA-256 hashed `Bearer` tokens compared in constant time (`subtle::ConstantTimeEq`).

## Security Posture

All production containers ship with:

```yaml
read_only: true
security_opt: [no-new-privileges:true]
cap_drop: [ALL]
tmpfs: ["/tmp"]
```

Additional controls:

- **Argon2id** password hashing.
- **JWT access + refresh** tokens with **Redis session blacklist** on logout.
- **Constant-time token comparison** for agent auth.
- **Rate limiting** — 120 req/min global, 10 req/min on authentication endpoints (cleaned every minute).
- **HTTP security headers** on Vercel deployments (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`).
- **TLS 1.3** everywhere via Let's Encrypt / Cloudflare.

## CI/CD

GitHub Actions under [`.github/workflows/`](./.github/workflows):

| Workflow | Trigger | Output |
|---|---|---|
| `ci.yaml` | PR + push | Lint + unit tests across all Rust + TypeScript packages |
| `build-server.yaml` | Changes in `dokuru-server/` | GHCR image `ghcr.io/rifuki/dokuru-server:{latest,vX.Y.Z,sha-abc}` |
| `build-www.yaml` | Changes in `dokuru-www/` | GHCR image `ghcr.io/rifuki/dokuru-www:*` |
| `build-landing.yaml` | Changes in `dokuru-landing/` | GHCR image `ghcr.io/rifuki/dokuru-landing:*` |
| `release-agent.yaml` | Tag push | Multi-arch `dokuru-linux-{amd64,arm64}` with `SHA256SUMS` under release `latest` |
| `release-deploy.yaml` | Tag push | `dokuru-deploy` binary under release `latest-deploy` |
| `deploy-compose-service.yaml` | Reusable | SSH deploy to VPS, `docker compose pull && up -d` |
| `toggle-compose-auto-deploy.yaml` | Manual | Flip auto-deploy flag on the VPS |

Release + deploy uses the pattern: tag push → GHCR → reusable compose deploy workflow → SSH into VPS → `dokuru-deploy deploy`.

## Related Projects

- **[dokuru-lab](../dokuru-lab)** — intentionally vulnerable SvelteKit + Compose stack that proves every rule end-to-end (cryptominer, memory blast, `/proc/<pid>/environ` secret theft, reverse-proxy sabotage).
- Thesis: *“Analisis dan Implementasi Konfigurasi Namespace dan Cgroup untuk Penguatan Isolasi Keamanan Container dengan Docker”* — see [`../words/`](../words) and [`../plan.md`](../plan.md).

## Contributing

```bash
git checkout -b feature/your-feature
# ... code ...
cargo fmt && cargo clippy -- -D warnings
cd dokuru-www && bun run lint
git commit -m "feat: add XYZ"   # Conventional Commits
git push origin feature/your-feature
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

## Acknowledgements

- [CIS Docker Benchmark v1.8.0](https://www.cisecurity.org/benchmark/docker) — the rule set.
- [Bollard](https://github.com/fussybeaver/bollard) — async Docker client for Rust.
- [Axum](https://github.com/tokio-rs/axum), [TanStack](https://tanstack.com/), [Leptos](https://leptos.dev/) — the platforms that made this pleasant to build.

## License

[MIT](./LICENSE) © [rifuki](https://github.com/rifuki)

---

> **⚠️ Run only on infrastructure you control.** Dokuru audits daemon configuration, restarts services, and rewrites Compose files. Always pilot in staging first.
>
> **🔒 Responsible disclosure:** email `security@dokuru.dev` before filing a public issue.
