use crate::components::atoms::{icon::icon, IconKind};
use crate::content::{AuditSection, AUDIT_SECTIONS};
use leptos::prelude::*;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::{closure::Closure, JsCast};

#[must_use]
pub(crate) fn audit_panel() -> impl IntoView {
    let (active_tab, set_active_tab) = signal("pillars");
    let (fixing, set_fixing) = signal(false);
    view! {
        <div data-testid="hero-audit-panel" class="relative w-full overflow-hidden rounded-[18px] border border-white/10 bg-[#09090B] shadow-[0_36px_84px_-28px_rgba(0,0,0,0.86)]">
            <div class="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
                <div class="scan-line absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[#2496ED]/10 to-transparent"/>
            </div>
            <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_35%_10%,rgba(36,150,237,0.10),transparent_34%),radial-gradient(circle_at_90%_0%,rgba(16,185,129,0.08),transparent_32%)]"/>

            <div class="relative flex items-center gap-2.5 border-b border-white/10 bg-[#121214]/95 px-3.5 py-3">
                <div class="flex shrink-0 gap-1.5">
                    <span class="h-2 w-2 rounded-full bg-zinc-700"/><span class="h-2 w-2 rounded-full bg-zinc-700"/><span class="h-2 w-2 rounded-full bg-zinc-700"/>
                </div>
                <div class="min-w-0 flex-1 truncate font-heading text-[13px] font-bold text-zinc-100">
                    <span>"Brave Lion"</span>
                    <span class="mx-2 text-zinc-600">"/"</span>
                    <span class="font-mono text-[#2496ED]">"debian13-2c4g-dokuru-lab"</span>
                </div>
                <span class="ml-auto inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-emerald-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"/>"live"
                </span>
            </div>

            <div class="relative grid md:grid-cols-[0.82fr_1.18fr] md:divide-x md:divide-white/10">
                <div class="p-3.5 md:p-4">
                    <div class="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">"audit score"</div>
                    <div class="mt-2.5 flex items-end gap-2.5">
                        <div class="font-heading text-[44px] font-black leading-none text-amber-400" data-testid="audit-score-value">"78"</div>
                        <div class="pb-1 font-heading text-lg font-black text-zinc-600">"/100"</div>
                    </div>
                    <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div class="h-full w-[78%] rounded-full bg-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.28)]"/>
                    </div>
                    <div class="mt-2.5 font-mono text-[10px] leading-relaxed text-zinc-500">"CIS Docker Benchmark · 36 checks"</div>

                    <div class="mt-4 grid grid-cols-3 gap-2">
                        {score_stat("28", "pass", "text-emerald-400", "border-emerald-500/25 bg-emerald-500/8")}
                        {score_stat("8", "fail", "text-rose-400", "border-rose-500/25 bg-rose-500/8")}
                        {score_stat("36", "total", "text-zinc-200", "border-white/10 bg-white/[0.03]")}
                    </div>
                </div>

                <div class="p-3.5 md:p-4">
                    <div class="flex items-start justify-between gap-2.5">
                        <div>
                            <div class="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                                {move || if active_tab.get() == "pillars" { "security pillars" } else { "cis benchmarks" }}
                            </div>
                        </div>
                        <div class="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5 text-[10px] font-semibold cursor-pointer">
                            <span
                                on:click=move |_| set_active_tab.set("pillars")
                                class=move || format!("rounded-md px-2 py-0.5 transition-colors {}", if active_tab.get() == "pillars" { "bg-[#2496ED] text-white" } else { "text-zinc-500 hover:text-zinc-300" })
                            >
                                "Pillars"
                            </span>
                            <span
                                on:click=move |_| set_active_tab.set("sections")
                                class=move || format!("rounded-md px-2 py-0.5 transition-colors {}", if active_tab.get() == "sections" { "bg-[#2496ED] text-white" } else { "text-zinc-500 hover:text-zinc-300" })
                            >
                                "Sections"
                            </span>
                        </div>
                    </div>

                    <div class="mt-3 flex flex-col gap-2.5 min-h-[140px]">
                        {move || if active_tab.get() == "pillars" {
                            AUDIT_SECTIONS.iter().map(pillar_row).collect_view().into_any()
                        } else {
                            CIS_SECTIONS.iter().map(cis_row).collect_view().into_any()
                        }}
                    </div>
                </div>
            </div>

            <div class="relative flex flex-col gap-2.5 border-t border-[#2496ED]/25 bg-[#2496ED]/5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between md:px-4">
                <div>
                    <div class="text-[13px] font-bold text-[#2496ED]">"8 rules can be auto-fixed"</div>
                    <div class="mt-1 text-[11px] text-[#2496ED]/70">"Namespace, cgroup limits, and privileged containers - one click."</div>
                </div>
                <button
                    on:click=move |_| {
                        if fixing.get() { return; }
                        set_fixing.set(true);
                        reset_fixing_after(set_fixing);
                    }
                    class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#2496ED] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_0_24px_rgba(36,150,237,0.22)] transition-colors hover:bg-[#1C7CBA] sm:shrink-0"
                >
                    {icon(IconKind::Wrench, 13, "", "2")}
                    "Fix All (8)"
                </button>

                {move || fixing.get().then(|| view! {
                    <div class="fixed bottom-6 right-6 animate-enter-up z-[100] pointer-events-none">
                        <div class="rounded-xl bg-[#09090B]/95 px-5 py-4 border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl flex items-start gap-3 w-[320px]">
                            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mt-0.5">
                                {icon(IconKind::Check, 16, "", "2")}
                            </div>
                            <div>
                                <div class="text-[13px] font-bold text-white">"Magic applied! ✨"</div>
                                <div class="mt-1 text-[12px] text-zinc-400">"We just hypothetically fixed 8 vulnerabilities for you in 12ms. (This is just a demo!)"</div>
                            </div>
                        </div>
                    </div>
                })}
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
        <div class=format!("rounded-lg border px-2 py-2 text-center {}", card_class)>
            <div class=format!("font-heading text-lg font-black leading-none {}", value_class)>{value}</div>
            <div class="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        </div>
    }
}

fn pillar_row(section: &'static AuditSection) -> impl IntoView {
    let width = format!("width: {}%", section.passed * 100 / section.total);

    view! {
        <div>
            <div class="mb-1.5 flex items-center gap-2.5">
                <span class="grid h-5 w-5 shrink-0 place-items-center text-[#2496ED]">{icon(section.icon, 13, "", "2")}</span>
                <span class="min-w-0 flex-1 truncate text-[13px] font-bold text-zinc-200">{section.name}</span>
                <span class="font-mono text-[11px] text-zinc-500">{format!("{}/{}", section.passed, section.total)}</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div class=format!("h-full rounded-full {}", section.bar_color) style=width/>
            </div>
        </div>
    }
}

struct CisSection {
    id: &'static str,
    name: &'static str,
    passed: u32,
    total: u32,
}

const CIS_SECTIONS: &[CisSection] = &[
    CisSection {
        id: "1",
        name: "Host Configuration",
        passed: 12,
        total: 14,
    },
    CisSection {
        id: "2",
        name: "Docker Daemon",
        passed: 9,
        total: 10,
    },
    CisSection {
        id: "3",
        name: "Daemon Config Files",
        passed: 15,
        total: 20,
    },
    CisSection {
        id: "4",
        name: "Images and Build",
        passed: 6,
        total: 10,
    },
    CisSection {
        id: "5",
        name: "Container Runtime",
        passed: 25,
        total: 30,
    },
];

fn cis_row(section: &'static CisSection) -> impl IntoView {
    let width = format!("width: {}%", section.passed * 100 / section.total);
    let bar_color = if section.passed == section.total {
        "bg-emerald-400"
    } else if section.passed * 100 / section.total > 50 {
        "bg-amber-400"
    } else {
        "bg-rose-400"
    };

    view! {
        <div>
            <div class="mb-1.5 flex items-center gap-2.5">
                <span class="grid h-5 w-5 shrink-0 place-items-center text-zinc-500 font-mono text-[10px] font-bold">{section.id}</span>
                <span class="min-w-0 flex-1 truncate text-[13px] font-bold text-zinc-200">{section.name}</span>
                <span class="font-mono text-[11px] text-zinc-500">{format!("{}/{}", section.passed, section.total)}</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div class=format!("h-full rounded-full {}", bar_color) style=width/>
            </div>
        </div>
    }
}

#[cfg(target_arch = "wasm32")]
fn reset_fixing_after(set_fixing: WriteSignal<bool>) {
    let Some(window) = web_sys::window() else {
        return;
    };

    let closure = Closure::wrap(Box::new(move || set_fixing.set(false)) as Box<dyn FnMut()>);
    let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(
        closure.as_ref().unchecked_ref(),
        3000,
    );
    closure.forget();
}

#[cfg(not(target_arch = "wasm32"))]
const fn reset_fixing_after(_set_fixing: WriteSignal<bool>) {}
