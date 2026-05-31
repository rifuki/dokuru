# API Surface

## Server Routes

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

## Agent Routes

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
