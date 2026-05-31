# Product Scope

Dokuru is focused Docker security tooling for namespace isolation, cgroup controls, runtime hardening, and host-level Docker hygiene. It audits and hardens Docker hosts with rule-level evidence instead of trying to be a general-purpose vulnerability management platform.

## In Scope

- Agent onboarding for Docker hosts through Cloudflare Tunnel, relay mode, or direct HTTP/HTTPS.
- CIS Docker Benchmark v1.8.0 aligned audits for host config, daemon files, image posture, runtime posture, namespaces, and cgroups.
- Controlled remediation with preview, configuration, streamed execution, saved history, evidence, and rollback metadata where available.
- Docker inventory and operations for containers, stacks, images, networks, volumes, events, exec, and host shell.
- Hosted multi-agent operation through `dokuru-server` and `dokuru-www`, plus direct single-host operation through the embedded agent UI.
- Public product/installation handoff through `dokuru-landing` and production Compose operations through `dokuru-deploy`.

## Out Of Scope

- General vulnerability management, ticketing, asset inventory, or cloud posture management.
- A replacement for Docker, Portainer, Kubernetes, or a full SIEM.
- Unreviewed automatic hardening on untrusted infrastructure.

## Public Docs And Screenshots

The README should stay compact and show the product path a new operator needs to understand: the empty dashboard after login, the add-agent modal, a live audit scan, and the saved audit result. Deeper Docker resource pages, fix panels, audit history, host shell, and CLI installer captures belong in `docs/screenshots.md`.

Auth and landing pages are intentionally omitted from the README preview because they do not explain the core Docker security workflow. CLI screenshots are useful only when tokens, temporary tunnel URLs, usernames, and hostnames are redacted.

Use Dokuru carefully, inspect generated changes, and keep the agent limited to trusted operators.
