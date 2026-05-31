# Architecture

## System Overview


Dokuru's core product path has three runtime components, a public landing site, a deployment helper, and one shared library:

| Component | Path | Role |
| --- | --- | --- |
| Agent | `dokuru-agent/` | Rust CLI and daemon installed on Docker hosts. Owns Docker socket access, audits, fix execution, local API, embedded dashboard, host shell, and relay client. |
| Server | `dokuru-server/` | Rust/Axum control plane. Owns users, JWT sessions, PostgreSQL persistence, Redis token blacklist, stored audit history, notifications, admin APIs, and agent relay. |
| Web Dashboard | `dokuru-www/` | React/TanStack dashboard. Owns agent onboarding UI, Docker resource pages, audit reports, FixWizard, realtime streams, settings, and admin views. |
| Landing Site | `dokuru-landing/` | Leptos/Trunk public site for the hosted product and installer handoff. |
| Deploy CLI | `dokuru-deploy/` | Rust helper for production Compose deployment, migration, health checks, config repair, and release updates. |
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
        landing["dokuru-landing<br/>Leptos + Trunk"]
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
    tls --> landing
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
    class www,landing app
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
|-- dokuru-landing/                  Public landing and install handoff site
|-- dokuru-deploy/                   Production Compose deployment helper
|-- dokuru-core/                     Shared audit report model
|-- docs/                            Operator and developer documentation
`-- .github/workflows/              CI, GHCR image builds, releases, deploy hooks
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
| CLI entrypoint | `dokuru-agent/src/main.rs` | `onboard`, `configure`, `doctor`, `status`, `audit`, `version`, `token`, `config`, `restart`, `update`, `uninstall`, `serve`. |
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

### `dokuru-landing`

`dokuru-landing` is the public site for the hosted product and install handoff. It is a Leptos CSR app built with Trunk and Tailwind, then served as a static image in production Compose.

Main responsibilities:

- Explain the product at the public domain.
- Present the current installer command.
- Send operators into the hosted dashboard or setup flow.

### `dokuru-deploy`

`dokuru-deploy` is a Rust CLI for managing the production Compose deployment.

Main responsibilities:

- Initialize and repair deployment configuration.
- Pull, migrate, start, stop, restart, and inspect Compose services.
- Run health checks and stream service logs.
- Update the deployment helper itself from release metadata.

## Runtime Architecture

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
