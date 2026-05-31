# Installation And Quick Start

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
