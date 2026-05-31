# Audit And Remediation

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
