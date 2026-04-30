use crate::components::atoms::{icon::icon, IconKind};
use crate::content::{RemediationKind, SeverityKind};
use leptos::prelude::*;

const fn severity_label(kind: SeverityKind) -> &'static str {
    match kind {
        SeverityKind::Fail => "FAIL",
        SeverityKind::Pass => "PASS",
        SeverityKind::Warn => "WARN",
    }
}

const fn remediation_label(kind: RemediationKind) -> &'static str {
    match kind {
        RemediationKind::Auto => "AUTO",
        RemediationKind::Guided => "GUIDED",
        RemediationKind::Manual => "MANUAL",
        RemediationKind::Ok => "OK",
    }
}

const fn severity_class(kind: SeverityKind) -> &'static str {
    match kind {
        SeverityKind::Fail => "text-rose-400 border-rose-500/30 bg-rose-500/10",
        SeverityKind::Pass => "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
        SeverityKind::Warn => "text-amber-400 border-amber-500/30 bg-amber-500/10",
    }
}

const fn remediation_class(kind: RemediationKind) -> &'static str {
    match kind {
        RemediationKind::Auto => "text-[#2496ED] bg-[#2496ED]/10 border-[#2496ED]/30",
        RemediationKind::Guided => "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
        RemediationKind::Manual => "text-zinc-300 bg-white/5 border-white/15",
        RemediationKind::Ok => "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    }
}

const fn remediation_icon(kind: RemediationKind) -> IconKind {
    match kind {
        RemediationKind::Auto => IconKind::Wrench,
        RemediationKind::Guided => IconKind::LifeBuoy,
        RemediationKind::Manual => IconKind::Clock,
        RemediationKind::Ok => IconKind::ShieldCheck,
    }
}

#[must_use]
pub(crate) fn severity_chip(kind: SeverityKind) -> impl IntoView {
    view! {
        <span class=format!("font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded border {}", severity_class(kind)) data-testid=format!("severity-{}", severity_label(kind).to_lowercase())>
            {severity_label(kind)}
        </span>
    }
}

#[must_use]
pub(crate) fn remediation_pill(kind: RemediationKind) -> impl IntoView {
    view! {
        <span class=format!("inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border {}", remediation_class(kind)) data-testid=format!("remediation-{}", remediation_label(kind).to_lowercase())>
            {icon(remediation_icon(kind), 10, "", "2.5")}
            {remediation_label(kind)}
        </span>
    }
}
