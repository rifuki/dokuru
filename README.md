# Dokuru

**Agent-based Docker security audit and hardening platform.**

[![CI](https://github.com/rifuki/dokuru/actions/workflows/ci.yaml/badge.svg)](https://github.com/rifuki/dokuru/actions/workflows/ci.yaml)

Dokuru audits Docker hosts against a pragmatic, CIS Docker Benchmark v1.8.0 aligned rule set, shows rule-level evidence, and applies supported hardening changes through a controlled preview, stream, history, and rollback workflow.

The project is designed for real Docker hosts, not only static reporting:

- Audit host configuration, Docker daemon settings, daemon file permissions, image/runtime posture, namespaces, and cgroups.
- Manage one or more Docker hosts from a hosted dashboard or the agent's embedded local dashboard.
- Connect agents by direct URL, Cloudflare Tunnel, or outbound relay WebSocket for hosts behind NAT.
- Preview fixes before mutation, stream each remediation step, and retain rollback metadata where the fix path can capture it.
- Keep all Docker socket access inside `dokuru-agent`; the server never needs the host Docker socket.

> Dokuru can change Docker daemon configuration, audit rules, Compose files, Dockerfiles, container runtime settings, and cgroup limits. Run it only on infrastructure you control, test fixes in staging first, and treat every agent token as a secret.

## How To Install

Dokuru can be used in two operating modes. Pick hosted mode when you want one dashboard for many Docker hosts. Pick direct mode when you only want the agent's built-in dashboard on a single host.

| Mode | Server required | Best for | Access path |
| --- | --- | --- | --- |
| Hosted | Yes | Teams, multiple hosts, stored audit history, admin views | Browser to `dokuru-www`, then server to agent by relay or direct URL. |
| Direct | No | Single host, local/private operation, quick inspection | Browser directly to the agent dashboard on port `3939`. |

### Hosted Mode

Use this mode when the hosted dashboard is available and you want to add Docker hosts as agents.

```mermaid
flowchart LR
    install["1. Install agent on Docker host"]
    choose["2. Choose access mode<br/>Cloudflare, Relay, or Direct"]
    copy["3. Copy Agent URL + Token"]
    add["4. Add Docker Agent<br/>in hosted dashboard"]
    audit["5. Run audit and apply supported fixes"]

    install --> choose --> copy --> add --> audit

    classDef step fill:#082f49,stroke:#38bdf8,color:#e0f2fe
    class install,choose,copy,add,audit step
```

Run this on the Docker host:

```bash
curl -fsSL https://dokuru.rifuki.dev/install | sudo bash
```

The onboarding wizard will:

- Install the `dokuru` binary.
- Create `/etc/dokuru/config.toml`.
- Generate an agent token in the `dok_...` format.
- Install and start the systemd service.
- Configure the selected access mode.

Recommended access mode choices:

| Choice | Use when | What to paste into dashboard |
| --- | --- | --- |
| Cloudflare Tunnel | You want the fastest HTTPS setup without a domain. | The generated `https://*.trycloudflare.com` URL and the `dok_...` token. |
| Relay Mode | The host is behind NAT/firewall and cannot expose inbound ports. | Use `relay` mode in Add Agent and paste the `dok_...` token. |
| Direct HTTP/HTTPS | The browser can reach the host through LAN, VPN, or your reverse proxy. | The reachable agent URL and the `dok_...` token. |

Then open the hosted dashboard, choose **Add Agent**, select the matching connection mode, paste the agent output, and run the first audit from the agent page.

### Direct Mode

Use this mode when you do not want a server. The agent serves its own embedded dashboard.

```bash
curl -fsSL https://dokuru.rifuki.dev/install | sudo bash
```

After onboarding, open the agent URL printed by the installer. By default, the local API and embedded dashboard listen on port `3939`.

```bash
# From the Docker host
open http://localhost:3939

# Or from your workstation through SSH port forwarding
ssh -L 3939:localhost:3939 user@docker-host-01
open http://localhost:3939
```

Use the token printed during onboarding when the dashboard asks for agent credentials. If the token is lost, rotate it on the host:

```bash
sudo dokuru token rotate
sudo dokuru restart
```

### Install Output Checklist

After installation, keep these values somewhere safe:

| Value | Example | Why it matters |
| --- | --- | --- |
| Agent URL | `https://xxx.trycloudflare.com` or `http://10.0.0.5:3939` | The dashboard uses it for direct/cloudflare/domain access. |
| Agent Token | `dok_...` | Required to authenticate privileged agent API calls. |
| Access Mode | `cloudflare`, `relay`, or `direct` | Must match the Add Agent form. |

Useful follow-up commands:

```bash
sudo dokuru status
sudo dokuru doctor
sudo dokuru config show
sudo dokuru token show
sudo dokuru token rotate
sudo dokuru restart
sudo dokuru update
```

## Contents

- [How To Install](#how-to-install)
- [System Overview](#system-overview)
- [Repository Map](#repository-map)
- [Architecture](#architecture)
- [Connection Modes](#connection-modes)
- [Audit And Remediation Flow](#audit-and-remediation-flow)
- [CIS Coverage](#cis-coverage)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Surface](#api-surface)
- [Security Best Practices](#security-best-practices)
- [Development](#development)
- [CI And Releases](#ci-and-releases)
- [License](#license)

## System Overview

Dokuru's core product path has three runtime components plus one shared library:

| Component | Path | Role |
| --- | --- | --- |
| Agent | `dokuru-agent/` | Rust CLI and daemon installed on Docker hosts. Owns Docker socket access, audits, fix execution, local API, embedded dashboard, host shell, and relay client. |
| Server | `dokuru-server/` | Rust/Axum control plane. Owns users, JWT sessions, PostgreSQL persistence, Redis token blacklist, stored audit history, notifications, admin APIs, and agent relay. |
| Web Dashboard | `dokuru-www/` | React/TanStack dashboard. Owns agent onboarding UI, Docker resource pages, audit reports, FixWizard, realtime streams, settings, and admin views. |
| Shared Core | `dokuru-core/` | Shared audit report DTOs and scoring helpers used by server-side report views. |

The important boundary is simple: `dokuru-server` coordinates and persists, `dokuru-www` presents and streams, and `dokuru-agent` performs privileged host work.

```mermaid
flowchart TB
    user["Operator browser"]

    subgraph edge["Public edge"]
        tls["HTTPS entrypoint<br/>Traefik, Vercel, or static host"]
    end

    subgraph frontend["Frontend"]
        www["dokuru-www<br/>React 19 + TanStack Router"]
    end

    subgraph backend["Control plane"]
        server["dokuru-server<br/>Axum REST + JWT + WebSocket relay"]
        pg[("PostgreSQL<br/>users, agents, audits, documents")]
        redis[("Redis<br/>session blacklist")]
    end

    subgraph hosts["Docker hosts"]
        agentA["dokuru-agent<br/>local API + audit + fix engine"]
        agentB["dokuru-agent<br/>relay mode"]
        dockerA["Docker Engine<br/>/var/run/docker.sock"]
        dockerB["Docker Engine<br/>/var/run/docker.sock"]
    end

    user -->|HTTPS| tls
    tls --> www
    tls --> server

    www -->|REST /api/v1| server
    www <-->|dashboard WS /ws| server
    www -.->|direct or tunnel HTTPS| agentA
    server <-->|relay WSS /ws/agent| agentB

    server --> pg
    server --> redis
    agentA --> dockerA
    agentB --> dockerB

    classDef surface fill:#0f172a,stroke:#38bdf8,color:#e0f2fe
    classDef app fill:#111827,stroke:#818cf8,color:#eef2ff
    classDef controlPlane fill:#1e1b4b,stroke:#c084fc,color:#f5f3ff
    classDef dataStore fill:#052e16,stroke:#22c55e,color:#dcfce7
    classDef hostNode fill:#3b160b,stroke:#fb923c,color:#ffedd5
    class user,tls surface
    class www app
    class server controlPlane
    class pg,redis dataStore
    class agentA,agentB,dockerA,dockerB hostNode
```

## Repository Map

```text
dokuru/
|-- README.md
|-- docker-compose.yaml              Production-oriented Compose stack
|-- docker-compose.override.yaml     Local development override
|-- rust-toolchain.toml              Rust 1.95.0, rustfmt, clippy
|-- dokuru-agent/                    Host-side Rust agent and CLI
|-- dokuru-server/                   Axum backend and relay server
|-- dokuru-www/                      React dashboard and embedded agent UI
|-- dokuru-core/                     Shared audit report model
`-- .github/workflows/              CI, GHCR image builds, agent release
```

### `dokuru-agent`

`dokuru-agent` builds the `dokuru` binary. It runs as a CLI during onboarding and as a long-lived daemon after installation.

Main responsibilities:

- Generate and rotate `dok_...` agent tokens.
- Write `/etc/dokuru/config.toml` and a systemd service.
- Serve a local token-protected API on port `3939` by default.
- Serve an embedded `dokuru-www` build in `VITE_DOKURU_MODE=agent`.
- Connect to Docker through `/var/run/docker.sock` with Bollard.
- Run the CIS-aligned audit registry and remediation helpers.
- Stream audit, fix, Docker events, container exec, and host shell sessions over WebSocket.
- Connect outbound to `dokuru-server` when relay mode is selected.

Important source areas:

| Area | Path | Notes |
| --- | --- | --- |
| CLI entrypoint | `dokuru-agent/src/main.rs` | `onboard`, `configure`, `doctor`, `status`, `token`, `restart`, `update`, `uninstall`, `serve`. |
| Local API | `dokuru-agent/src/api/` | Axum routes, auth middleware, CORS, relay client, embedded assets. |
| Audit registry | `dokuru-agent/src/audit/rule_registry/` | Section 1 through 5 rule definitions. |
| Fix engine | `dokuru-agent/src/audit/fix_helpers.rs` | Docker update, Compose patch/override, recreate, auditd, daemon config, rollback/history. |
| Docker API | `dokuru-agent/src/docker/` | Containers, images, networks, volumes, stacks, events. |
| Host shell | `dokuru-agent/src/host_shell.rs` | PTY-backed host shell used by the dashboard. |

### `dokuru-server`

`dokuru-server` is the hosted control plane and relay. It does not need direct Docker socket access.

Main responsibilities:

- User registration, login, refresh, logout, password reset, email verification, and session management.
- JWT access tokens and HTTP-only refresh cookie flow.
- Optional Redis-backed token blacklist for revoked sessions.
- Agent CRUD and token hash matching.
- Stored audit history and normalized report views via `dokuru-core`.
- WebSocket relay between the browser and relay-mode agents.
- Dashboard event broadcast for agent status, audit completion, and notifications.
- Admin views for users, agents, audits, documents, config, logs, and stats.

Important source areas:

| Area | Path | Notes |
| --- | --- | --- |
| Entrypoint | `dokuru-server/src/main.rs` | Config load, logging, state, bootstrap admin, graceful shutdown. |
| Router | `dokuru-server/src/routes.rs` | `/health`, `/ws`, `/ws/agent`, `/api/v1/*`, `/media/*`. |
| App state | `dokuru-server/src/state.rs` | Config, DB, Redis, services, agent registry, WS manager. |
| Agent relay | `dokuru-server/src/feature/agent/relay.rs` | Command/response and stream bridging over WebSocket. |
| Auth | `dokuru-server/src/feature/auth/` | Argon2, JWT, sessions, refresh cookie. |
| Persistence | `dokuru-server/migrations/` | Users, sessions, API keys, agents, audits, documents, notifications. |

### `dokuru-www`

`dokuru-www` is a Vite SPA used in two modes:

| Mode | Build variable | Behavior |
| --- | --- | --- |
| Cloud dashboard | `VITE_DOKURU_MODE=cloud` | Talks to `dokuru-server` for auth, agent registry, audit history, relay routes, and dashboard events. |
| Embedded agent UI | `VITE_DOKURU_MODE=agent` | Served by `dokuru-agent`; bootstraps a local synthetic user and talks to the same-origin agent API. |

Main responsibilities:

- Auth pages and authenticated dashboard layout.
- Agent onboarding, connection state, and token caching.
- Docker containers, images, networks, volumes, stacks, events, exec, and host shell pages.
- Live audit run, historical audit detail, report views, filters, export/print flows.
- FixWizard and FixAllWizard with preview, target configuration, progress, history, and rollback.
- Notifications, user settings, sessions, and admin screens.

Important source areas:

| Area | Path | Notes |
| --- | --- | --- |
| Router | `dokuru-www/src/routes/` | TanStack file routes, protected user/admin layouts. |
| API clients | `dokuru-www/src/lib/api/` | Server API, direct agent API, URL builders, axios refresh handling. |
| Docker client | `dokuru-www/src/services/docker-api.ts` | Switches between relay and direct agent calls. |
| Stores | `dokuru-www/src/stores/` | Zustand auth, agents, audits, shell sessions, UI state. |
| Audit UI | `dokuru-www/src/features/audit/` | Fix hooks, FixWizard, FixAllWizard, report components. |
| Env validation | `dokuru-www/plugins/env-validator.ts` | Requires `VITE_API_BASE_URL` in cloud mode, optional in agent mode. |

## Architecture

### Runtime Boundaries

```mermaid
flowchart LR
    subgraph browser["Browser runtime"]
        router["TanStack Router"]
        query["TanStack Query"]
        stores["Zustand stores"]
        wsClient["WebSocket clients"]
    end

    subgraph control["dokuru-server"]
        http["REST handlers"]
        auth["JWT + session middleware"]
        relay["Agent relay registry"]
        report["Audit report service"]
        admin["Admin services"]
    end

    subgraph data["Persistence"]
        pg[("PostgreSQL")]
        redis[("Redis")]
        uploads[("Local uploads")]
    end

    subgraph host["Docker host"]
        agent["dokuru-agent"]
        api["Local Axum API"]
        engine["Audit + fix engine"]
        docker["Docker Engine"]
        files["Host files<br/>daemon.json, audit rules, Compose"]
    end

    router --> query
    router --> stores
    router --> wsClient
    query -->|REST| http
    wsClient <-->|/ws dashboard events| relay
    http --> auth
    http --> report
    http --> admin
    http --> relay
    report --> pg
    auth --> pg
    auth --> redis
    admin --> pg
    admin --> uploads

    relay <-->|/ws/agent command + stream| agent
    wsClient -.->|direct HTTPS + Bearer token| api
    api --> engine
    agent --> engine
    engine --> docker
    engine --> files

    classDef uiLayer fill:#082f49,stroke:#38bdf8,color:#e0f2fe
    classDef serviceLayer fill:#1e1b4b,stroke:#a78bfa,color:#f5f3ff
    classDef dataStore fill:#052e16,stroke:#22c55e,color:#dcfce7
    classDef hostLayer fill:#431407,stroke:#fb923c,color:#ffedd5
    class router,query,stores,wsClient uiLayer
    class http,auth,relay,report,admin serviceLayer
    class pg,redis,uploads dataStore
    class agent,api,engine,docker,files hostLayer
```

### Agent Internals

```mermaid
flowchart TB
    cli["dokuru CLI"]
    cfg["/etc/dokuru/config.toml<br/>or DOKURU_CONFIG"]
    svc["systemd service<br/>dokuru serve"]

    cli -->|onboard/configure/token/doctor| cfg
    cfg --> svc
    svc --> mode{"access.mode"}

    mode -->|direct, cloudflare, domain| localApi["Local Axum API<br/>0.0.0.0:3939"]
    mode -->|relay| relayClient["Outbound relay client<br/>wss://api.../ws/agent"]

    localApi --> auth["Bearer token middleware<br/>SHA-256 hash compare"]
    auth --> routes["Protected routes"]
    relayClient --> dispatcher["Relay command dispatcher"]

    routes --> audit["Audit routes<br/>/audit, /audit/ws"]
    routes --> fix["Fix routes<br/>/fix, /fix/stream"]
    routes --> dockerApi["Docker routes<br/>containers, images, stacks, events"]
    routes --> shell["Host shell<br/>PTY WebSocket"]
    routes --> trivy["Trivy image scan"]
    routes --> web["Embedded dashboard assets"]

    dispatcher --> audit
    dispatcher --> fix
    dispatcher --> dockerApi
    dispatcher --> shell

    audit --> registry["RuleRegistry"]
    registry --> s1["Section 1<br/>Host config"]
    registry --> s2["Section 2<br/>Daemon config"]
    registry --> s3["Section 3<br/>File permissions"]
    registry --> s4["Section 4<br/>Images"]
    registry --> s5["Section 5<br/>Runtime"]

    fix --> helpers["fix_helpers.rs"]
    helpers --> docker["Docker socket"]
    helpers --> hostFiles["Host files and services"]
    dockerApi --> docker
    shell --> pty["zsh, bash, or sh"]

    classDef entryLayer fill:#082f49,stroke:#38bdf8,color:#e0f2fe
    classDef apiLayer fill:#1e1b4b,stroke:#a78bfa,color:#f5f3ff
    classDef auditLayer fill:#312e81,stroke:#818cf8,color:#eef2ff
    classDef hostLayer fill:#431407,stroke:#fb923c,color:#ffedd5
    class cli,cfg,svc,mode entryLayer
    class localApi,relayClient,auth,routes,dispatcher,web apiLayer
    class audit,fix,registry,s1,s2,s3,s4,s5,helpers auditLayer
    class docker,dockerApi,hostFiles,shell,pty,trivy hostLayer
```

### Server Internals

```mermaid
flowchart TB
    req["HTTP request or WebSocket upgrade"]
    router["routes.rs"]
    rate["Rate limiter<br/>120/min global, 10/min auth"]
    authMw["Auth middleware<br/>Bearer JWT or WS access_token"]
    adminMw["Admin middleware"]

    req --> router
    router --> rate
    rate --> public["Public routes<br/>health, auth login/register, email flows"]
    rate --> protected["Protected /api/v1 routes"]
    protected --> authMw
    authMw --> userSvc["User + settings"]
    authMw --> agentSvc["Agent CRUD + relay operations"]
    authMw --> auditSvc["Audit history + reports"]
    authMw --> notifSvc["Notifications"]
    authMw --> adminMw
    adminMw --> adminSvc["Admin users, agents, audits, config, logs, stats"]

    router --> dashWs["/ws dashboard events"]
    router --> agentWs["/ws/agent relay channel"]
    agentWs --> registry["In-memory AgentRegistry<br/>DashMap"]
    registry --> pending["Pending commands<br/>UUID -> oneshot"]
    registry --> streams["Open streams<br/>UUID -> channel"]

    userSvc --> pg[("PostgreSQL")]
    agentSvc --> pg
    auditSvc --> pg
    notifSvc --> pg
    adminSvc --> pg
    authMw --> redis[("Redis blacklist")]
    public --> email["Resend email"]
    adminSvc --> files["uploads/"]

    classDef entryLayer fill:#082f49,stroke:#38bdf8,color:#e0f2fe
    classDef serviceLayer fill:#1e1b4b,stroke:#a78bfa,color:#f5f3ff
    classDef relayLayer fill:#312e81,stroke:#818cf8,color:#eef2ff
    classDef dataStore fill:#052e16,stroke:#22c55e,color:#dcfce7
    class req,router,rate,authMw,adminMw entryLayer
    class public,protected,userSvc,agentSvc,auditSvc,notifSvc,adminSvc,email serviceLayer
    class dashWs,agentWs,registry,pending,streams relayLayer
    class pg,redis,files dataStore
```

### Dashboard Internals

```mermaid
flowchart LR
    app["main.tsx"] --> provider["AuthProvider + QueryClient"]
    provider --> router["TanStack Router"]

    router --> publicRoutes["Public routes<br/>login, register, reset, verify"]
    router --> authLayout["Authenticated layout"]

    authLayout --> userRoutes["User routes<br/>agents, Docker resources, audits, settings"]
    authLayout --> adminRoutes["Admin routes<br/>users, agents, audits, keys, documents, settings"]

    userRoutes --> agentStore["use-agent-store"]
    userRoutes --> auditStore["use-audit-store"]
    userRoutes --> shellStore["host shell session store"]
    adminRoutes --> apiClient["apiClient"]

    agentStore --> apiClient
    auditStore --> agentApi["agent API facade"]
    agentApi --> relayPath["Relay path<br/>server /api/v1/agents/:id/*"]
    agentApi --> directPath["Direct path<br/>agent URL + Bearer token"]
    shellStore --> ws["WebSocket streams"]

    apiClient --> server["dokuru-server"]
    relayPath --> server
    directPath --> agent["dokuru-agent"]
    ws --> server
    ws --> agent

    classDef uiLayer fill:#082f49,stroke:#38bdf8,color:#e0f2fe
    classDef stateLayer fill:#1e1b4b,stroke:#a78bfa,color:#f5f3ff
    classDef edgeLayer fill:#312e81,stroke:#818cf8,color:#eef2ff
    classDef remoteLayer fill:#431407,stroke:#fb923c,color:#ffedd5
    class app,provider,router,publicRoutes,authLayout,userRoutes,adminRoutes uiLayer
    class agentStore,auditStore,shellStore stateLayer
    class apiClient,agentApi,relayPath,directPath,ws edgeLayer
    class server,agent remoteLayer
```

## Connection Modes

An agent can be added to the dashboard through multiple access modes. The mode controls only the network path. The agent token is still required.

| Mode | Path | Best use case | Notes |
| --- | --- | --- | --- |
| Direct | Browser to `http(s)://host:3939` | LAN, VPN, private reverse proxy | Simple and low latency, but the browser must reach the agent URL. |
| Cloudflare | Browser to `https://*.trycloudflare.com` to agent | Demo, temporary TLS without a domain | Fast setup, but quick tunnel URLs can change. |
| Relay | Browser to server to outbound agent WSS | Hosts behind NAT or firewall | Agent initiates the connection; no inbound port is required on the Docker host. |
| Domain | Browser to user-managed domain/proxy to agent | Custom TLS/proxy setup | Treated like a direct endpoint by the dashboard model. |

```mermaid
flowchart TB
    browser["Browser"]
    server["dokuru-server"]
    agent["dokuru-agent"]
    docker["Docker Engine"]
    cf["Cloudflare Tunnel"]
    proxy["User TLS proxy"]

    browser -->|Direct HTTPS + Bearer token| agent
    browser -->|Cloudflare HTTPS| cf --> agent
    browser -->|Domain HTTPS| proxy --> agent
    browser -->|Relay REST/WS| server
    server <-->|Outbound WSS /ws/agent| agent
    agent -->|Unix socket| docker

    classDef publicNode fill:#0f172a,stroke:#38bdf8,color:#e0f2fe
    classDef relayLayer fill:#1e1b4b,stroke:#a78bfa,color:#f5f3ff
    classDef hostLayer fill:#431407,stroke:#fb923c,color:#ffedd5
    class browser,cf,proxy publicNode
    class server relayLayer
    class agent,docker hostLayer
```

### Relay Command Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant A as dokuru-agent
    participant S as dokuru-server
    participant W as dokuru-www
    participant D as Docker Engine

    A->>S: WebSocket /ws/agent
    A->>S: auth { token }
    S->>S: SHA-256 token hash lookup
    S-->>A: auth_success { agent_id }
    W->>S: Start audit or fix for agent_id
    S->>A: command { id, command, payload }
    A->>D: Docker inspect/update/recreate as needed
    A-->>S: response { id, success, data }
    S-->>W: REST response or WS stream event
```

## Audit And Remediation Flow

### Audit Lifecycle

```mermaid
flowchart TB
    start["User clicks Run Audit"]
    choose{"Agent access mode"}
    direct["Open direct WebSocket<br/>/audit/ws?token=..."]
    relay["Open relay WebSocket<br/>/api/v1/agents/:id/audit/stream"]
    registry["Agent RuleRegistry"]
    sections["Section modules<br/>1, 2, 3, 4, 5"]
    collect["Collect Docker + host evidence"]
    result["CheckResult per rule<br/>status, evidence, affected targets"]
    score["Score and summaries"]
    persist["Persist audit history<br/>server or local agent history"]
    display["Dashboard report<br/>filters, groups, remediation plan"]

    start --> choose
    choose -->|direct, cloudflare, domain, local agent| direct
    choose -->|relay| relay
    direct --> registry
    relay --> registry
    registry --> sections
    sections --> collect
    collect --> result
    result --> score
    score --> persist
    persist --> display

    classDef actionLayer fill:#082f49,stroke:#38bdf8,color:#e0f2fe
    classDef engineLayer fill:#312e81,stroke:#818cf8,color:#eef2ff
    classDef dataStore fill:#052e16,stroke:#22c55e,color:#dcfce7
    class start,choose,direct,relay,display actionLayer
    class registry,sections,collect,result,score engineLayer
    class persist dataStore
```

### Fix Lifecycle

```mermaid
flowchart TB
    finding["Failed rule"]
    preview["Fix preview<br/>targets + current values + suggested strategy"]
    wizard["FixWizard<br/>operator confirms strategy and limits"]
    stream["Fix stream<br/>progress events over WebSocket"]
    dispatch{"Rule family"}

    cgroup["Cgroup resource fix<br/>memory, CPU shares, PIDs"]
    namespace["Namespace fix<br/>network, PID, IPC, UTS, userns"]
    runtime["Runtime isolation fix<br/>capabilities, devices, seccomp, privileged"]
    image["Image/runtime config fix<br/>USER, HEALTHCHECK"]
    daemon["Daemon or host fix<br/>userns-remap, no-new-privileges, auditd, files"]
    guided["Guided or manual remediation"]

    strategy{"Apply strategy"}
    live["docker update<br/>live cgroup mutation"]
    override["Compose override<br/>dokuru override file"]
    patch["Patch source Compose YAML"]
    dockerfile["Patch Dockerfile<br/>rebuild required"]
    recreate["Stop, remove, recreate container"]
    hostChange["Edit host file/service<br/>daemon.json, audit rules, chmod/chown"]

    history["FixHistoryEntry<br/>request, outcome, progress, rollback plan"]
    verify["Optional verify<br/>rerun rule check"]
    rollback["Rollback when captured plan exists"]

    finding --> preview --> wizard --> stream --> dispatch
    dispatch --> cgroup --> strategy
    dispatch --> namespace --> strategy
    dispatch --> runtime --> strategy
    dispatch --> image --> strategy
    dispatch --> daemon --> hostChange
    dispatch --> guided
    strategy --> live
    strategy --> override
    strategy --> patch
    strategy --> dockerfile
    strategy --> recreate
    live --> history
    override --> history
    patch --> history
    dockerfile --> history
    recreate --> history
    hostChange --> history
    guided --> history
    history --> verify
    history --> rollback

    classDef uiLayer fill:#082f49,stroke:#38bdf8,color:#e0f2fe
    classDef familyLayer fill:#312e81,stroke:#818cf8,color:#eef2ff
    classDef mutateLayer fill:#431407,stroke:#fb923c,color:#ffedd5
    classDef dataStore fill:#052e16,stroke:#22c55e,color:#dcfce7
    class finding,preview,wizard,stream,dispatch,strategy uiLayer
    class cgroup,namespace,runtime,image,daemon,guided familyLayer
    class live,override,patch,dockerfile,recreate,hostChange mutateLayer
    class history,verify,rollback dataStore
```

### Fix Strategy Matrix

| Strategy | Used for | Mutates | Typical rules |
| --- | --- | --- | --- |
| `docker_update` | Live cgroup changes | Running container cgroups | `5.11`, `5.12`, `5.29` |
| `dokuru_override` | Compose-managed services | Dokuru-managed Compose override file | Runtime, image, and cgroup fixes where Compose metadata exists |
| `compose_update` | Source Compose patching | Original Compose YAML with backup | Namespace, cgroup, image/runtime settings |
| `dockerfile_update` | Strict source image remediation | Dockerfile with backup | `4.1`, `4.6` |
| `recreate` | Runtime flags that cannot be changed live | Container lifecycle | `5.5`, `5.10`, `5.16`, `5.17`, `5.21`, `5.31` |
| Guided/manual | Human decision required or unsafe to automate | None unless user applies guide | Docker group review, cgroup confirmation, custom exceptions |

## CIS Coverage

Dokuru currently registers **39 CIS Docker Benchmark v1.8.0 aligned checks** for Docker host hardening and container isolation.

```mermaid
pie title Registered checks by CIS section
    "Section 1 Host Configuration" : 13
    "Section 2 Docker Daemon" : 3
    "Section 3 File Permissions" : 8
    "Section 4 Images" : 2
    "Section 5 Runtime" : 13
```

| Section | Scope | Registered rules | Count |
| --- | --- | --- | ---: |
| 1 | Host Configuration | `1.1.2`, `1.1.3`, `1.1.4`, `1.1.5`, `1.1.6`, `1.1.7`, `1.1.8`, `1.1.9`, `1.1.10`, `1.1.11`, `1.1.12`, `1.1.14`, `1.1.18` | 13 |
| 2 | Docker Daemon Configuration | `2.10`, `2.11`, `2.15` | 3 |
| 3 | Docker Daemon File Permissions | `3.1`, `3.2`, `3.3`, `3.4`, `3.5`, `3.6`, `3.17`, `3.18` | 8 |
| 4 | Container Images and Build Files | `4.1`, `4.6` | 2 |
| 5 | Container Runtime Configuration | `5.4`, `5.5`, `5.10`, `5.11`, `5.12`, `5.16`, `5.17`, `5.18`, `5.21`, `5.22`, `5.25`, `5.29`, `5.31` | 13 |

### Security Pillars

```mermaid
flowchart LR
    rules["39 registered checks"]
    host["Host configuration<br/>auditd, Docker group"]
    daemon["Daemon and files<br/>userns-remap, no-new-privileges, ownership, permissions"]
    images["Images<br/>non-root user, healthcheck"]
    namespace["Namespace isolation<br/>network, PID, IPC, UTS, userns"]
    cgroup["Cgroup controls<br/>memory, CPU shares, PIDs, cgroup parent"]
    runtime["Runtime hardening<br/>privileged, caps, devices, seccomp"]

    rules --> host
    rules --> daemon
    rules --> images
    rules --> namespace
    rules --> cgroup
    rules --> runtime

    classDef rootLayer fill:#0f172a,stroke:#38bdf8,color:#e0f2fe
    classDef pillarLayer fill:#1e1b4b,stroke:#a78bfa,color:#f5f3ff
    class rules rootLayer
    class host,daemon,images,namespace,cgroup,runtime pillarLayer
```

### High Impact Runtime Rules

| Rule | Risk detected | Typical supported remediation |
| --- | --- | --- |
| `5.5` | Container runs privileged | Recreate without privileged mode. |
| `5.10` | Container shares host network namespace | Recreate without `--network=host`. |
| `5.11` | Container has no memory limit | `docker update --memory` or Compose memory limit. |
| `5.12` | Container has no CPU shares policy | `docker update --cpu-shares` or Compose `cpu_shares`. |
| `5.16` | Container shares host PID namespace | Recreate without `--pid=host`. |
| `5.17` | Container shares host IPC namespace | Recreate with private IPC. |
| `5.21` | Container shares host UTS namespace | Recreate without `--uts=host`. |
| `5.29` | Container has no PIDs limit | `docker update --pids-limit` or Compose `pids_limit`. |
| `5.31` | Container disables user namespace remapping | Recreate without `--userns=host`. |

## Quick Start

### Install An Agent On A Docker Host

Use the installer on a Linux Docker host. The installer downloads the latest release binary, verifies checksums, installs `dokuru`, then starts onboarding.

```bash
curl -fsSL https://dokuru.rifuki.dev/install | sudo bash
```

During onboarding, choose an access mode:

- `Cloudflare` for the fastest demo with a temporary HTTPS tunnel.
- `Relay` when the host cannot expose an inbound port.
- `Direct` when the browser can reach the agent through LAN, VPN, or a trusted reverse proxy.

After onboarding, copy the printed agent URL and `dok_...` token into the dashboard.

Useful agent commands:

```bash
sudo dokuru status
sudo dokuru doctor
sudo dokuru config show
sudo dokuru token show
sudo dokuru token rotate
sudo dokuru restart
sudo dokuru update
```

### Run The Hosted Stack Locally

Start PostgreSQL and Redis from the root Compose file:

```bash
docker compose up -d dokuru-db dokuru-redis
```

Configure and run the backend:

```bash
cd dokuru-server
cp config/secrets.toml.example config/secrets.toml
```

For local development, set at least these values in `dokuru-server/config/secrets.toml`:

```toml
[database]
url = "postgres://dokuru:secret@localhost:15432/dokuru_db"

[redis]
url = "redis://localhost:16379"

[auth]
access_secret = "change-me-access-secret-min-32-chars"
refresh_secret = "change-me-refresh-secret-min-32-chars"

[email]
resend_api_key = "your_resend_api_key_here"
from_email = "noreply@localhost"
```

Then run:

```bash
cargo run
```

Run the dashboard in another shell:

```bash
cd dokuru-www
bun install
VITE_DOKURU_MODE=cloud VITE_API_BASE_URL=http://localhost:9393 bun run dev
```

`VITE_API_BASE_URL` should be the API origin, not the versioned path. The frontend appends `/api/v1` internally.

### Run The Embedded Agent UI In Development

Build the dashboard in agent mode and then run the agent:

```bash
cd dokuru-www
bun install
VITE_DOKURU_MODE=agent bun run build

cd ../dokuru-agent
cargo run -- serve
```

For a real host, prefer the installer and onboarding flow because it writes a token, config file, and service unit.

### Production Compose Shape

The root `docker-compose.yaml` defines the production services:

| Service | Purpose |
| --- | --- |
| `dokuru-db` | PostgreSQL 16 database. |
| `dokuru-redis` | Redis 7 for session blacklist. |
| `dokuru-server-migrate` | One-shot SQLx migration image. |
| `dokuru-server` | Backend API and relay server. |
| `dokuru-www` | Static dashboard served by nginx. |

Production Compose expects a `traefik-public` network and server config mounted at `./dokuru-server/config`.

```bash
docker network create traefik-public
docker compose up -d dokuru-db dokuru-redis
docker compose --profile migrate run --rm dokuru-server-migrate
docker compose up -d dokuru-server dokuru-www
```

## Configuration

### Server Configuration

`dokuru-server` uses layered configuration. Later layers override earlier layers.

1. `dokuru-server/config/defaults.toml`, embedded at compile time.
2. `dokuru-server/config/local.toml`, optional non-secret machine-specific values.
3. `dokuru-server/config/secrets.toml`, optional secrets and deployment-specific values.
4. Environment variables using `DOKURU__SECTION__KEY`.

Common production overrides:

```bash
DOKURU__APP__RUST_ENV=production
DOKURU__APP__RUST_LOG=info
DOKURU__DATABASE__URL=postgres://dokuru:secret@dokuru-db:5432/dokuru_db
DOKURU__REDIS__URL=redis://dokuru-redis:6379
DOKURU__AUTH__ACCESS_SECRET=<32+ char secret>
DOKURU__AUTH__REFRESH_SECRET=<32+ char secret>
DOKURU__SERVER__CORS_ALLOWED_ORIGINS=https://app.example.com
DOKURU__COOKIE__SAME_SITE=none
DOKURU__COOKIE__SECURE=true
DOKURU__EMAIL__RESEND_API_KEY=re_xxxxx
DOKURU__UPLOAD__BASE_URL=https://api.example.com/media
BOOTSTRAP_ADMIN_PASSWORD=<initial admin password>
```

The server validates required values at startup. `DATABASE_URL`, access/refresh secrets, and the Resend API key must be set through TOML or environment variables.

### Agent Configuration

The agent loads configuration from:

1. `DOKURU_CONFIG`, if set.
2. `/etc/dokuru/config.toml`, the normal production path.
3. `./config.toml`, useful for local development.

Default values:

```toml
[server]
host = "0.0.0.0"
port = 3939
cors_origins = ["*"]

[docker]
socket = "/var/run/docker.sock"

[auth]
token_hash = ""
token = ""

[access]
mode = "cloudflare"
url = ""
```

The onboarding wizard writes a token hash for authentication. The raw token is also retained for bootstrap and relay flows, so protect the config file like a secret.

### Frontend Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `VITE_DOKURU_MODE` | Optional | `cloud` by default. Use `agent` for the embedded local agent UI. |
| `VITE_API_BASE_URL` | Required in cloud mode | API origin, for example `https://api.example.com` or `http://localhost:9393`. |
| `VITE_ENABLE_HOST_SHELL` | Optional | Enables host shell UI. Keep `false` unless intentionally needed. |

## API Surface

### Server Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Basic healthcheck. |
| `GET` | `/health/detailed` | Detailed service health. |
| `GET` | `/ws` | Dashboard event WebSocket. |
| `GET` | `/ws/agent` | Agent relay WebSocket. |
| `POST` | `/api/v1/auth/register` | User registration, strict rate limit. |
| `POST` | `/api/v1/auth/login` | Login, strict rate limit. |
| `POST` | `/api/v1/auth/refresh` | Refresh access token using cookie. |
| `POST` | `/api/v1/auth/logout` | Logout and blacklist session token when Redis is available. |
| `GET` | `/api/v1/auth/me` | Current authenticated identity. |
| `GET/PATCH` | `/api/v1/users/me` | User profile. |
| `GET/POST/PUT/DELETE` | `/api/v1/agents/*` | Agent CRUD plus audit/fix/relay operations. |
| `GET/DELETE` | `/api/v1/notifications/*` | Notifications and preferences. |
| `GET/POST/DELETE` | `/api/v1/documents/*` | User documents. |
| `GET/POST/PATCH/DELETE` | `/api/v1/admin/*` | Admin-only users, agents, audits, config, logs, stats. |
| `GET` | `/media/*` | Static uploads. |

### Agent Routes

Agent routes are available on the direct agent URL, normally port `3939`. Protected routes require `Authorization: Bearer <dok_token>`. WebSockets may also pass `?token=...`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Basic agent health. |
| `GET` | `/health/detail` | Docker and host readiness details. |
| `GET` | `/api/v1/bootstrap` | Localhost-only bootstrap data for embedded UI. |
| `GET` | `/api/v1/info` | Docker host summary. |
| `GET` | `/ws` | Agent info update stream. |
| `GET` | `/audit` | Run full audit. |
| `GET` | `/audit/{rule_id}` | Run one rule. |
| `GET` | `/audit/ws` | Live audit stream. |
| `GET/POST/DELETE` | `/audit/history/*` | Audit history and reports. |
| `POST` | `/fix` | Run a fix request. |
| `GET` | `/fix/preview` | Preview targets and strategy. |
| `GET` | `/fix/stream` | Live fix progress stream. |
| `GET` | `/fix/history` | Fix history. |
| `POST` | `/fix/rollback` | Rollback a recorded fix when supported. |
| `GET` | `/rules` | Registered rules. |
| `GET` | `/docker/*` | Containers, images, networks, volumes, stacks, events, exec. |
| `GET` | `/host/shell` | Host shell info. |
| `GET` | `/host/shell/stream` | PTY-backed host shell WebSocket. |
| `POST` | `/trivy/image` | Trivy image scan when `trivy` exists on the host. |

## Security Best Practices

### Recommended Deployment Posture

- Run `dokuru-agent` only on Docker hosts you own.
- Treat membership in the Docker group as root-equivalent.
- Treat the agent token as a privileged host credential.
- Prefer relay mode for private hosts that should not expose an inbound agent port.
- If direct mode is used, put the agent behind VPN, trusted LAN, or a hardened TLS reverse proxy.
- Restrict server CORS to the dashboard origins you actually use.
- Keep Redis enabled so revoked refresh tokens are blacklisted.
- Keep `VITE_ENABLE_HOST_SHELL=false` in hosted production unless there is a deliberate operational need.
- Keep server config and agent config out of Git. Use `local.toml`, `secrets.toml`, or environment variables managed by your deployment system.
- Run fixes on staging first, especially daemon-level and Compose-level fixes.

### Container Hardening Used By The Compose Stack

The production Compose services apply hardening where possible:

```yaml
read_only: true
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
tmpfs:
  - /tmp
```

### Sensitive Capabilities

| Capability | Why it is sensitive | Recommendation |
| --- | --- | --- |
| Agent Docker socket access | Docker socket is root-equivalent on the host. | Do not expose the agent without token protection and TLS. |
| Host shell | Opens a real PTY on the Docker host. | Keep disabled in hosted production unless explicitly required. |
| Container exec | Provides shell access inside containers. | Limit dashboard access to trusted operators. |
| Fix engine | Can edit host files, Docker daemon settings, Compose files, and containers. | Always review preview and backup behavior before applying. |
| Local token cache | Direct agent tokens may be cached in browser storage. | Avoid untrusted browsers and harden against XSS. |

## Development

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

### Testing Notes

- `dokuru-agent` has unit and integration tests for audit types, registry behavior, Docker operations, auth, WebSocket contracts, and API integration.
- `dokuru-server` has unit tests plus integration-style tests for auth, Redis, database, and WebSocket paths. Some integration tests are ignored unless the required infrastructure is running.
- `dokuru-www` currently has lint/build coverage but no dedicated test script.
- CI builds `dokuru-www` in agent mode before Rust agent tests so embedded UI behavior is exercised at build time.

## CI And Releases

| Workflow | Purpose |
| --- | --- |
| `ci.yaml` | Web lint/build, Rust fmt/clippy/test for agent, server, and core crates. |
| `build-server.yaml` | Builds `dokuru-server` and `dokuru-server-migrate` GHCR images. |
| `build-www.yaml` | Builds the hosted dashboard image. |
| `release-agent.yaml` | Builds Linux AMD64/ARM64 `dokuru` agent binaries with embedded dashboard assets and publishes installer/checksum release assets. |

Release assets produced for the agent include:

- `dokuru-linux-amd64`
- `dokuru-linux-arm64`
- `install.sh`
- `SHA256SUMS`
- `version.json`

## License

Dokuru is licensed under the Elastic License 2.0. See [`LICENSE`](LICENSE) for the full terms.

## Product Scope

Dokuru is focused Docker security tooling for namespace isolation, cgroup controls, and runtime hardening. It audits and hardens Docker hosts with rule-level evidence instead of trying to be a general-purpose vulnerability management platform.

Use it carefully, inspect the generated changes, and keep the agent limited to trusted operators.
