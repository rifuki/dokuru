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
}

#[derive(Clone, Copy)]
pub enum RemediationKind {
    Auto,
    Guided,
    Manual,
    Ok,
}

pub(crate) struct AuditSection {
    pub(crate) name: &'static str,
    pub(crate) icon: IconKind,
    pub(crate) color: &'static str,
    pub(crate) bar_color: &'static str,
    pub(crate) passed: usize,
    pub(crate) total: usize,
}

pub(crate) const AUDIT_SECTIONS: &[AuditSection] = &[
    AuditSection {
        name: "Namespace Isolation",
        icon: IconKind::Box,
        color: "text-zinc-300 border-white/10",
        bar_color: "bg-rose-500",
        passed: 2,
        total: 6,
    },
    AuditSection {
        name: "Cgroup Controls",
        icon: IconKind::Gauge,
        color: "text-zinc-300 border-white/10",
        bar_color: "bg-emerald-400",
        passed: 4,
        total: 5,
    },
    AuditSection {
        name: "Runtime Hardening",
        icon: IconKind::Shield,
        color: "text-zinc-300 border-white/10",
        bar_color: "bg-emerald-400",
        passed: 1,
        total: 1,
    },
    AuditSection {
        name: "Host Configuration",
        icon: IconKind::ServerCog,
        color: "text-zinc-300 border-white/10",
        bar_color: "bg-amber-400",
        passed: 12,
        total: 14,
    },
    AuditSection {
        name: "Images & Daemon",
        icon: IconKind::Boxes,
        color: "text-zinc-300 border-white/10",
        bar_color: "bg-amber-400",
        passed: 9,
        total: 10,
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
    Feature { icon: IconKind::ServerCog, label: "04 / agent", title: "Agent with a bundled dashboard", body: "The Rust agent installs on each Docker host, serves its own dashboard, and can optionally join the hosted app for multi-host control.", points: &["Built-in dashboard", "Token-authenticated access", "Optional control plane"] },
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
        icon: IconKind::Box,
        label: "6 rules",
        title: "Namespace Isolation",
        intro: "Isolate containers from the host kernel view.",
        rules: &[
            "User namespace support (2.10)",
            "Host network namespace (5.10)",
            "Host PID namespace (5.16)",
            "Host IPC namespace (5.17)",
            "Host UTS namespace (5.21)",
            "Host user namespace (5.31)",
        ],
    },
    CoverageGroup {
        icon: IconKind::Gauge,
        label: "5 rules",
        title: "Cgroup Controls",
        intro: "Bound resource usage per container.",
        rules: &[
            "Memory limits (5.11)",
            "CPU shares / priority (5.12)",
            "PIDs limit (5.29)",
            "Cgroup usage confirmation (5.25)",
            "Default cgroup usage (2.11)",
        ],
    },
    CoverageGroup {
        icon: IconKind::Shield,
        label: "28 rules",
        title: "Runtime Baseline",
        intro: "Supporting CIS checks for the host, daemon, images, and unsafe runtime flags.",
        rules: &[
            "Privileged container detection (5.5)",
            "Capabilities, mounts, devices, and seccomp (5.4, 5.6, 5.18, 5.22)",
            "Host audit trails (1.1.2-1.1.18)",
            "Docker daemon file permissions (3.1-3.8)",
            "Image hygiene: user and healthcheck overrides (4.1, 4.6)",
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
                label: "How It Works",
                href: "#how-it-works",
                test_id: "footer-link-how-it-works",
            },
            FooterLink {
                label: "Coverage",
                href: "#coverage",
                test_id: "footer-link-coverage",
            },
            FooterLink {
                label: "Why Dokuru",
                href: "#why-dokuru",
                test_id: "footer-link-why-dokuru",
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
                label: "CIS Benchmark",
                href: "https://www.cisecurity.org/benchmark/docker",
                test_id: "footer-link-cis-benchmark",
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
