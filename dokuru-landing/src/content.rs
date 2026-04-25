use crate::components::atoms::IconKind;

pub(crate) const APP_URL: &str = "https://app.dokuru.rifuki.dev";
pub(crate) const GITHUB_URL: &str = "https://github.com/rifuki/dokuru";

#[cfg(target_arch = "wasm32")]
pub(crate) const INSTALL_CMD: &str = "curl -fsSL https://dokuru.rifuki.dev/install | bash";

pub(crate) struct NavItem {
    pub(crate) label: &'static str,
    pub(crate) href: &'static str,
    pub(crate) test_id: &'static str,
}

pub(crate) const NAV: &[NavItem] = &[
    NavItem {
        label: "Features",
        href: "#features",
        test_id: "nav-link-features",
    },
    NavItem {
        label: "How it works",
        href: "#how-it-works",
        test_id: "nav-link-how-it-works",
    },
    NavItem {
        label: "Coverage",
        href: "#coverage",
        test_id: "nav-link-coverage",
    },
    NavItem {
        label: "Why Dokuru",
        href: "#why-dokuru",
        test_id: "nav-link-why-dokuru",
    },
];

#[derive(Clone, Copy)]
pub enum SeverityKind {
    Fail,
    Pass,
    Warn,
}

#[allow(dead_code)]
#[derive(Clone, Copy)]
pub enum RemediationKind {
    Auto,
    Guided,
    Manual,
    Ok,
}

pub(crate) struct AuditRule {
    pub(crate) rule: &'static str,
    pub(crate) sev: SeverityKind,
    pub(crate) rem: RemediationKind,
    pub(crate) detail: &'static str,
}

pub(crate) struct AuditSection {
    pub(crate) name: &'static str,
    pub(crate) icon: IconKind,
    pub(crate) color: &'static str,
    pub(crate) bar_color: &'static str,
    pub(crate) passed: usize,
    pub(crate) total: usize,
    pub(crate) rules: &'static [AuditRule],
}

pub(crate) const AUDIT_SECTIONS: &[AuditSection] = &[
    AuditSection {
        name: "Namespace Isolation",
        icon: IconKind::Box,
        color: "text-blue-400 border-blue-500/30",
        bar_color: "bg-blue-500",
        passed: 1,
        total: 5,
        rules: &[
            AuditRule {
                rule: "2.8 User namespace remapping",
                sev: SeverityKind::Pass,
                rem: RemediationKind::Ok,
                detail: "userns-remap: default",
            },
            AuditRule {
                rule: "5.9 Host network namespace",
                sev: SeverityKind::Fail,
                rem: RemediationKind::Guided,
                detail: "1 container using --net=host",
            },
        ],
    },
    AuditSection {
        name: "Cgroup Controls",
        icon: IconKind::Gauge,
        color: "text-amber-400 border-amber-500/30",
        bar_color: "bg-amber-500",
        passed: 2,
        total: 5,
        rules: &[AuditRule {
            rule: "5.11 Memory limit",
            sev: SeverityKind::Warn,
            rem: RemediationKind::Auto,
            detail: "3 containers without --memory",
        }],
    },
    AuditSection {
        name: "Runtime Hardening",
        icon: IconKind::Shield,
        color: "text-rose-400 border-rose-500/30",
        bar_color: "bg-rose-500",
        passed: 3,
        total: 6,
        rules: &[AuditRule {
            rule: "5.4 Privileged containers",
            sev: SeverityKind::Fail,
            rem: RemediationKind::Auto,
            detail: "2 containers with --privileged",
        }],
    },
];

pub(crate) struct Pain {
    pub(crate) num: &'static str,
    pub(crate) title: &'static str,
    pub(crate) body: &'static str,
}

pub(crate) const PAINS: &[Pain] = &[
    Pain { num: "01", title: "Manual review doesn't scale.", body: "Inspecting namespaces, cgroup limits, and runtime flags by hand across every Docker host is slow, error-prone, and hard to repeat." },
    Pain { num: "02", title: "Isolation quietly breaks.", body: "Misconfigured user, network, PID, or IPC namespaces — and missing cgroup limits — weaken the boundaries that keep containers contained." },
    Pain { num: "03", title: "Runtime flags bypass your threat model.", body: "Privileged mode, sensitive host-path mounts, and an exposed Docker socket silently hand containers the keys to the host." },
    Pain { num: "04", title: "Findings without evidence don't ship.", body: "Teams need rule-level results, evidence, and a remediation path — not another dashboard of vague severity counts." },
];

pub struct Feature {
    pub(crate) icon: IconKind,
    pub(crate) label: &'static str,
    pub(crate) title: &'static str,
    pub(crate) body: &'static str,
    pub(crate) points: &'static [&'static str],
}

pub(crate) const FEATURES: &[Feature] = &[
    Feature { icon: IconKind::ShieldCheck, label: "01 / audit", title: "Isolation-focused security audits", body: "CIS-aligned checks for namespace isolation and cgroup controls, plus runtime inspection of risky Docker configurations — with structured pass/fail evidence per rule.", points: &["Namespace and cgroup coverage", "Runtime flag inspection", "Rule-level evidence"] },
    Feature { icon: IconKind::Wrench, label: "02 / remediate", title: "Supported auto-remediation", body: "Apply one-click fixes for supported rules. For the rest, Dokuru provides guided remediation or clear manual steps — never an unsafe automatic change.", points: &["One-click auto-fixes", "Guided remediation", "Manual playbooks"] },
    Feature { icon: IconKind::History, label: "03 / history", title: "Audit reports and history", body: "Every run is stored per host: security score summary, detailed rule-level findings, and a timeline you can come back to for review and evidence.", points: &["Per-host score summary", "Rule-level findings", "Stored timeline"] },
    Feature { icon: IconKind::ServerCog, label: "04 / agent", title: "Agent-based host inspection", body: "A lightweight Rust agent installs on each Docker host and exposes a token-authenticated endpoint. Manage many hosts from a single dashboard.", points: &["Lightweight Rust agent", "Token-authenticated access", "Multi-host dashboard"] },
];

pub(crate) struct Step {
    pub(crate) num: &'static str,
    pub(crate) title: &'static str,
    pub(crate) body: &'static str,
}

pub(crate) const STEPS: &[Step] = &[
    Step { num: "01", title: "Install the agent", body: "Run one command to install the agent. It auto-configures, starts a Cloudflare Tunnel, and generates your credentials." },
    Step { num: "02", title: "Add to dashboard", body: "Copy the agent URL and token from the install output, then add it to your dashboard to connect." },
    Step { num: "03", title: "Run security audit", body: "Click 'Run Audit' from the dashboard to scan your Docker host against CIS benchmarks and apply fixes." },
];

pub struct CoverageGroup {
    pub(crate) icon: IconKind,
    pub(crate) label: &'static str,
    pub(crate) title: &'static str,
    pub(crate) intro: &'static str,
    pub(crate) rules: &'static [&'static str],
}

pub(crate) const COVERAGE_GROUPS: &[CoverageGroup] = &[
    CoverageGroup {
        icon: IconKind::Boxes,
        label: "group.a",
        title: "Namespace controls",
        intro: "Isolate containers from the host kernel view.",
        rules: &[
            "User namespace support",
            "Host network namespace isolation",
            "Host PID namespace isolation",
            "Host IPC namespace isolation",
            "Host UTS namespace isolation",
            "Host user namespace isolation",
        ],
    },
    CoverageGroup {
        icon: IconKind::Gauge,
        label: "group.b",
        title: "Cgroup controls",
        intro: "Bound resource usage per container.",
        rules: &[
            "Memory limits",
            "CPU shares / priority",
            "PIDs limit",
            "Cgroup usage confirmation",
        ],
    },
    CoverageGroup {
        icon: IconKind::Lock,
        label: "group.c",
        title: "Critical runtime isolation",
        intro: "Catch flags that silently pierce the sandbox.",
        rules: &[
            "Privileged container detection",
            "Sensitive host path mounts",
            "Docker socket exposure",
            "Host device exposure",
            "Seccomp / no-new-privileges",
        ],
    },
];

pub struct WhyPoint {
    pub(crate) icon: IconKind,
    pub(crate) title: &'static str,
    pub(crate) body: &'static str,
}

pub(crate) const WHY_POINTS: &[WhyPoint] = &[
    WhyPoint { icon: IconKind::Cpu, title: "Rust-based agent and backend", body: "Low overhead, predictable performance, and a tight surface area on every Docker host." },
    WhyPoint { icon: IconKind::KeyRound, title: "Token-authenticated host access", body: "Each host exposes a scoped, token-authenticated endpoint — no broad infrastructure access required." },
    WhyPoint { icon: IconKind::Archive, title: "Stored audit history", body: "Every run is kept per host, so you can compare runs, build evidence, and show progress over time." },
    WhyPoint { icon: IconKind::Zap, title: "Auto-fix for selected rules", body: "Safe, reviewable auto-remediation where it makes sense — guided or manual paths where it doesn't." },
    WhyPoint { icon: IconKind::Container, title: "Docker-focused inspection model", body: "Not a generic server scanner. Dokuru understands Docker containers, namespaces, and cgroups." },
    WhyPoint { icon: IconKind::Code, title: "Open source and transparent", body: "Full source code available. Review the audit logic, contribute improvements, and run it anywhere." },
];

pub(crate) struct FooterColumn {
    pub(crate) title: &'static str,
    pub(crate) links: &'static [FooterLink],
}

pub(crate) struct FooterLink {
    pub(crate) label: &'static str,
    pub(crate) href: &'static str,
    pub(crate) test_id: &'static str,
}

pub(crate) const FOOTER_COLUMNS: &[FooterColumn] = &[
    FooterColumn {
        title: "Product",
        links: &[
            FooterLink {
                label: "Features",
                href: "#features",
                test_id: "footer-link-features",
            },
            FooterLink {
                label: "Audit Coverage",
                href: "#coverage",
                test_id: "footer-link-audit-coverage",
            },
            FooterLink {
                label: "How It Works",
                href: "#how-it-works",
                test_id: "footer-link-how-it-works",
            },
            FooterLink {
                label: "Dashboard",
                href: "#cta",
                test_id: "footer-link-dashboard",
            },
        ],
    },
    FooterColumn {
        title: "Resources",
        links: &[
            FooterLink {
                label: "GitHub",
                href: GITHUB_URL,
                test_id: "footer-link-github",
            },
            FooterLink {
                label: "Documentation",
                href: "#docs",
                test_id: "footer-link-documentation",
            },
            FooterLink {
                label: "API",
                href: "#api",
                test_id: "footer-link-api",
            },
            FooterLink {
                label: "Changelog",
                href: "#changelog",
                test_id: "footer-link-changelog",
            },
        ],
    },
    FooterColumn {
        title: "Project",
        links: &[
            FooterLink {
                label: "About",
                href: "#about",
                test_id: "footer-link-about",
            },
            FooterLink {
                label: "Contact",
                href: "#contact",
                test_id: "footer-link-contact",
            },
            FooterLink {
                label: "Research Context",
                href: "#research",
                test_id: "footer-link-research-context",
            },
        ],
    },
    FooterColumn {
        title: "Legal",
        links: &[
            FooterLink {
                label: "Privacy Policy",
                href: "#privacy",
                test_id: "footer-link-privacy-policy",
            },
            FooterLink {
                label: "Terms",
                href: "#terms",
                test_id: "footer-link-terms",
            },
        ],
    },
];
