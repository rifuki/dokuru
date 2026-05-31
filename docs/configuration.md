# Configuration

## Server Configuration

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

## Agent Configuration

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

## Frontend Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `VITE_DOKURU_MODE` | Optional | `cloud` by default. Use `agent` for the embedded local agent UI. |
| `VITE_API_BASE_URL` | Required in cloud mode | API origin, for example `https://api.example.com` or `http://localhost:9393`. |
| `VITE_ENABLE_HOST_SHELL` | Optional | Enables host shell UI. Keep `false` unless intentionally needed. |
