use super::workflow_panels::{
    agent_dashboard_panel, audit_preview_panel, cloud_dashboard_panel, terminal_install_panel,
};
use crate::components::atoms::{section_eyebrow::centered_section_eyebrow, IconKind};
use crate::utils::clipboard::{copy_install_command, reset_copied_after};
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[derive(Clone, Copy, PartialEq, Eq)]
enum WorkflowMode {
    Hosted,
    Direct,
}

#[must_use]
pub(crate) fn how_it_works() -> impl IntoView {
    let active_mode = RwSignal::new(WorkflowMode::Hosted);
    let active_step = RwSignal::new(0usize);
    let copied = RwSignal::new(false);
    let heading_ref = reveal_ref::<html::Div>();
    let panel_ref = reveal_ref::<html::Div>();
    let handle_copy = move |_| {
        copy_install_command();
        copied.set(true);
        reset_copied_after(copied);
    };

    view! {
        <section id="how-it-works" data-testid="how-it-works-section" class="relative py-24 md:py-32 border-t border-white/5 overflow-hidden">
            <div class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div class="max-w-7xl mx-auto px-6 md:px-10">
                <div node_ref=heading_ref class="reveal mb-16 flex flex-col items-center text-center">
                    {centered_section_eyebrow(IconKind::History, "/ how it works")}
                    <h2 class="font-heading text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1] max-w-3xl">
                        "Three steps from install to audit."
                    </h2>
                    <p class="mt-5 text-zinc-400 text-base md:text-[17px] leading-relaxed max-w-2xl">
                        "Use the hosted dashboard to manage agents through a server, or access the agent dashboard directly — no server required."
                    </p>
                    <div class="mt-10">
                        {mode_tabs(active_mode)}
                    </div>
                </div>

                <div class="grid lg:grid-cols-12 gap-8 lg:gap-12 items-start mt-8">
                    <ol class="lg:col-span-5 space-y-3">
                        {(0..3).map(|i| step_item(active_mode, active_step, i)).collect_view()}
                    </ol>

                    <div node_ref=panel_ref class="reveal lg:col-span-7 relative mt-8 lg:mt-0" data-reveal="left" style="--motion-delay: 200ms">
                        <div class="absolute -inset-0.5 bg-gradient-to-br from-[#2496ED]/20 to-purple-500/10 rounded-2xl blur-xl opacity-50" />
                        <div class="relative bg-black/40 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-sm overflow-hidden">
                            <div class=move || panel_class(active_step.get(), 0, "#050505")>
                                {terminal_install_panel(copied, handle_copy)}
                            </div>
                            <div class=move || panel_class(active_step.get(), 1, "#050505")>
                                <div class=move || if active_mode.get() == WorkflowMode::Hosted { "workflow-panel" } else { "hidden" }>
                                    {cloud_dashboard_panel()}
                                </div>
                                <div class=move || if active_mode.get() == WorkflowMode::Direct { "workflow-panel" } else { "hidden" }>
                                    {agent_dashboard_panel()}
                                </div>
                            </div>
                            <div class=move || panel_class(active_step.get(), 2, "#09090B")>
                                {audit_preview_panel()}
                            </div>
                        </div>
                        <div class="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 flex justify-between px-2">
                            <span>"// select a step to view details"</span>
                            <span class="text-[#2496ED]">{move || if active_mode.get() == WorkflowMode::Hosted { "hosted mode active" } else { "direct mode active" }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    }
}

fn mode_tabs(active_mode: RwSignal<WorkflowMode>) -> impl IntoView {
    view! {
        <div class="relative grid w-[430px] max-w-[calc(100vw-3rem)] grid-cols-2 rounded-full border border-white/10 bg-white/[0.02] p-1.5 backdrop-blur-sm shadow-xl">
            <span class=move || if active_mode.get() == WorkflowMode::Hosted { "absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/2)] translate-x-0 rounded-full bg-white/[0.08] shadow-sm ring-1 ring-white/10 transition-transform duration-200 ease-out" } else { "absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/2)] translate-x-full rounded-full bg-white/[0.08] shadow-sm ring-1 ring-white/10 transition-transform duration-200 ease-out" } />
            {mode_tab(active_mode, WorkflowMode::Hosted, "Hosted", "via server")}
            {mode_tab(active_mode, WorkflowMode::Direct, "Direct", "no server")}
        </div>
    }
}

fn mode_tab(
    active_mode: RwSignal<WorkflowMode>,
    mode: WorkflowMode,
    title: &'static str,
    label: &'static str,
) -> impl IntoView {
    view! {
        <button type="button" on:click=move |_| active_mode.set(mode) class=move || if active_mode.get() == mode { "relative z-10 flex h-11 cursor-pointer items-center justify-center gap-2.5 rounded-full px-4 text-white transition-colors" } else { "relative z-10 flex h-11 cursor-pointer items-center justify-center gap-2.5 rounded-full px-4 text-zinc-400 transition-colors hover:text-zinc-200" }>
            <span class="font-heading text-[15px] font-semibold">{title}</span>
            <span class=move || if active_mode.get() == mode { "font-mono text-[10px] uppercase tracking-wider text-[#2496ED]" } else { "font-mono text-[10px] uppercase tracking-wider text-zinc-500" }>{label}</span>
        </button>
    }
}

fn step_item(
    active_mode: RwSignal<WorkflowMode>,
    active_step: RwSignal<usize>,
    index: usize,
) -> impl IntoView {
    let step_ref = reveal_ref::<html::Li>();

    view! {
        <li node_ref=step_ref data-testid=format!("how-step-{}", step_num(index)) class="reveal group" data-reveal="right" style=format!("--motion-delay: {}ms", index * 100)>
            <button type="button" on:click=move |_| active_step.set(index) class=move || if active_step.get() == index { "relative flex w-full cursor-pointer gap-5 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-5 text-left shadow-lg ring-1 ring-white/5 transition-all before:absolute before:inset-0 before:bg-gradient-to-r before:from-[#2496ED]/10 before:to-transparent before:opacity-100 md:p-6" } else { "relative flex w-full cursor-pointer gap-5 overflow-hidden rounded-2xl border border-transparent p-5 text-left transition-all before:absolute before:inset-0 before:bg-gradient-to-r before:from-[#2496ED]/10 before:to-transparent before:opacity-0 hover:bg-white/[0.03] hover:before:opacity-50 md:p-6" }>
                <div class="relative z-10 flex-shrink-0 pt-0.5">
                    <div class=move || if active_step.get() == index { "w-8 h-8 rounded-full border border-[#2496ED]/50 bg-[#2496ED]/10 grid place-items-center font-mono text-[11px] font-semibold text-[#2496ED] shadow-[0_0_12px_rgba(36,150,237,0.4)] transition-all" } else { "w-8 h-8 rounded-full border border-white/10 bg-black/50 grid place-items-center font-mono text-[11px] font-medium text-zinc-500 group-hover:text-zinc-300 transition-all" }>
                        {step_num(index)}
                    </div>
                </div>
                <div class="relative z-10">
                    <h3 class=move || if active_step.get() == index { "font-heading text-lg md:text-xl font-bold text-white transition-colors" } else { "font-heading text-lg md:text-xl font-semibold text-zinc-400 group-hover:text-zinc-200 transition-colors" }>{move || step_title(active_mode.get(), index)}</h3>
                    <div class=move || if active_step.get() == index { "grid grid-rows-[1fr] transition-all duration-300 ease-in-out" } else { "grid grid-rows-[0fr] lg:grid-rows-[1fr] transition-all duration-300 ease-in-out opacity-0 lg:opacity-100" }>
                        <div class="overflow-hidden">
                            <p class=move || if active_step.get() == index { "mt-2 text-zinc-300 text-[14.5px] leading-relaxed" } else { "mt-2 text-zinc-500 text-[14.5px] leading-relaxed group-hover:text-zinc-400" }>{move || step_body(active_mode.get(), index)}</p>
                        </div>
                    </div>
                </div>
            </button>
        </li>
    }
}

fn panel_class(active_step: usize, index: usize, background: &'static str) -> String {
    let visible = active_step == index;
    let display = if visible { "workflow-panel" } else { "hidden" };
    let background = if background == "#09090B" {
        "bg-[#09090B]"
    } else {
        "bg-[#050505]"
    };

    format!("{display} {background} h-full w-full")
}

const fn step_num(index: usize) -> &'static str {
    match index {
        0 => "01",
        1 => "02",
        _ => "03",
    }
}

const fn step_title(mode: WorkflowMode, index: usize) -> &'static str {
    match (mode, index) {
        (_, 0) => "Install the agent",
        (WorkflowMode::Hosted, 1) => "Add agent to dashboard",
        (WorkflowMode::Direct, 1) => "Open agent dashboard",
        _ => "Run security audit",
    }
}

const fn step_body(mode: WorkflowMode, index: usize) -> &'static str {
    match (mode, index) {
        (_, 0) => "Run one command to install the agent. It starts the service, opens a tunnel, and generates your credentials.",
        (WorkflowMode::Hosted, 1) => "Paste the agent URL and token into the hosted dashboard. Pick Cloudflare Tunnel for the fastest setup.",
        (WorkflowMode::Direct, 1) => "Open the agent on its public/private :3939 host URL, or forward port 3939 over SSH for locked-down hosts.",
        _ => "Run the audit from whichever dashboard you chose, inspect evidence, then apply supported fixes.",
    }
}
