use crate::components::atoms::{icon::icon, IconKind};
use crate::content::{AuditSection, AUDIT_SECTIONS};
use leptos::prelude::*;

#[must_use]
pub(crate) fn audit_panel() -> impl IntoView {
    view! {
        <div data-testid="hero-audit-panel" class="relative w-full overflow-hidden rounded-[18px] border border-white/10 bg-[#09090B] shadow-[0_40px_100px_-24px_rgba(0,0,0,0.86)]">
            <div class="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
                <div class="scan-line absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[#2496ED]/10 to-transparent"/>
            </div>
            <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_35%_10%,rgba(36,150,237,0.10),transparent_34%),radial-gradient(circle_at_90%_0%,rgba(16,185,129,0.08),transparent_32%)]"/>

            <div class="relative flex items-center gap-3 border-b border-white/10 bg-[#121214]/95 px-4 py-3.5">
                <div class="flex shrink-0 gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/>
                </div>
                <div class="min-w-0 flex-1 font-heading text-sm font-bold text-zinc-100">
                    <span>"Brave Lion"</span>
                    <span class="mx-2 text-zinc-600">"/"</span>
                    <span class="font-mono text-[#2496ED]">"debian13-2c4g-dokuru-lab"</span>
                </div>
                <span class="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"/>"live"
                </span>
            </div>

            <div class="relative grid md:grid-cols-[0.88fr_1.12fr] md:divide-x md:divide-white/10">
                <div class="p-4 md:p-5">
                    <div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">"audit score"</div>
                    <div class="mt-3 flex items-end gap-3">
                        <div class="font-heading text-5xl font-black leading-none text-amber-400" data-testid="audit-score-value">"78"</div>
                        <div class="pb-1 font-heading text-xl font-black text-zinc-600">"/100"</div>
                    </div>
                    <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                        <div class="h-full w-[78%] rounded-full bg-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.28)]"/>
                    </div>
                    <div class="mt-3 font-mono text-[11px] text-zinc-500">"CIS Docker Benchmark v1.8.0 · 36 rules"</div>

                    <div class="mt-5 grid grid-cols-3 gap-2.5">
                        {score_stat("28", "pass", "text-emerald-400", "border-emerald-500/25 bg-emerald-500/8")}
                        {score_stat("8", "fail", "text-rose-400", "border-rose-500/25 bg-rose-500/8")}
                        {score_stat("36", "total", "text-zinc-200", "border-white/10 bg-white/[0.03]")}
                    </div>
                </div>

                <div class="p-4 md:p-5">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">"security pillars"</div>
                        </div>
                        <div class="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5 text-[11px] font-semibold">
                            <span class="rounded-md bg-[#2496ED] px-2.5 py-1 text-white">"Pillars"</span>
                            <span class="px-2.5 py-1 text-zinc-500">"Sections"</span>
                        </div>
                    </div>

                    <div class="mt-4 flex flex-col gap-3">
                        {AUDIT_SECTIONS.iter().map(pillar_row).collect_view()}
                    </div>
                </div>
            </div>

            <div class="relative flex flex-col gap-3 border-t border-[#2496ED]/25 bg-[#2496ED]/5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between md:px-5">
                <div>
                    <div class="text-sm font-bold text-[#2496ED]">"8 rules can be auto-fixed"</div>
                    <div class="mt-1 text-xs text-[#2496ED]/70">"Namespace, cgroup limits, and privileged containers - one click."</div>
                </div>
                <button class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2496ED] px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_28px_rgba(36,150,237,0.25)] transition-colors hover:bg-[#1C7CBA] sm:shrink-0">
                    {icon(IconKind::Wrench, 15, "", "2")}
                    "Fix All (8)"
                </button>
            </div>
        </div>
    }
}

fn score_stat(
    value: &'static str,
    label: &'static str,
    value_class: &'static str,
    card_class: &'static str,
) -> impl IntoView {
    view! {
        <div class=format!("rounded-xl border px-3 py-2.5 text-center {}", card_class)>
            <div class=format!("font-heading text-xl font-black leading-none {}", value_class)>{value}</div>
            <div class="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        </div>
    }
}

fn pillar_row(section: &'static AuditSection) -> impl IntoView {
    let width = format!("width: {}%", section.passed * 100 / section.total);

    view! {
        <div>
            <div class="mb-2 flex items-center gap-3">
                <span class="grid h-6 w-6 shrink-0 place-items-center text-[#2496ED]">{icon(section.icon, 15, "", "2")}</span>
                <span class="min-w-0 flex-1 truncate text-sm font-bold text-zinc-200">{section.name}</span>
                <span class="font-mono text-xs text-zinc-500">{format!("{}/{}", section.passed, section.total)}</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div class=format!("h-full rounded-full {}", section.bar_color) style=width/>
            </div>
        </div>
    }
}
