# Security Best Practices

## Recommended Deployment Posture

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

## Container Hardening Used By The Compose Stack

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

## Sensitive Capabilities

| Capability | Why it is sensitive | Recommendation |
| --- | --- | --- |
| Agent Docker socket access | Docker socket is root-equivalent on the host. | Do not expose the agent without token protection and TLS. |
| Host shell | Opens a real PTY on the Docker host. | Keep disabled in hosted production unless explicitly required. |
| Container exec | Provides shell access inside containers. | Limit dashboard access to trusted operators. |
| Fix engine | Can edit host files, Docker daemon settings, Compose files, and containers. | Always review preview and backup behavior before applying. |
| Local token cache | Direct agent tokens may be cached in browser storage. | Avoid untrusted browsers and harden against XSS. |
