use super::{AddAgentPanel, AuditPreviewPanel, TerminalInstallPanel};
use crate::content::STEPS;
use crate::utils::clipboard::{copy_install_command, reset_copied_after};
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[component]
pub(crate) fn HowItWorks() -> impl IntoView {
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
        <section id="how-it-works" data-testid="how-it-works-section" class="relative py-24 md:py-32 border-t border-white/5">
            <div class="max-w-7xl mx-auto px-6 md:px-10">
                <div node_ref=heading_ref class="reveal mb-14 max-w-3xl">
                    <div class="font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4">"/ how it works"</div>
                    <h2 class="font-heading text-3xl md:text-4xl font-bold tracking-tight text-white leading-[1.1]">
                        "Three steps from"
                        <br class="hidden sm:block"/>
                        "install to audit."
                    </h2>
                </div>

                <div class="grid lg:grid-cols-12 gap-10 items-start">
                    <ol class="lg:col-span-5 space-y-8">
                        {STEPS.iter().enumerate().map(|(i, step)| {
                            let step_ref = reveal_ref::<html::Li>();

                            view! {
                                <li node_ref=step_ref data-testid=format!("how-step-{}", step.num) class="reveal grid grid-cols-[auto_1fr] gap-5 cursor-pointer group" data-reveal="right" style=format!("--motion-delay: {}ms", i * 100) on:click=move |_| active_step.set(i)>
                                    <div class="flex flex-col items-center">
                                        <div class=move || if active_step.get() == i { "w-10 h-10 rounded-md border border-[#2496ED] bg-[#2496ED]/10 grid place-items-center font-mono text-sm text-[#2496ED] transition-all" } else { "w-10 h-10 rounded-md border border-white/15 bg-[#09090B] grid place-items-center font-mono text-sm text-[#2496ED] transition-all" }>
                                            {step.num}
                                        </div>
                                        <div class=if i < STEPS.len() - 1 { "w-px flex-1 bg-white/15 mt-2" } else { "hidden" }/>
                                    </div>
                                    <div class="pb-4">
                                        <h3 class=move || if active_step.get() == i { "font-heading text-xl md:text-2xl font-bold text-white group-hover:text-white transition-colors" } else { "font-heading text-xl md:text-2xl font-bold text-zinc-400 group-hover:text-white transition-colors" }>{step.title}</h3>
                                        <p class="mt-2 text-zinc-400 text-[15px] leading-relaxed max-w-md">{step.body}</p>
                                    </div>
                                </li>
                            }
                        }).collect_view()}
                    </ol>

                    <div node_ref=panel_ref class="reveal lg:col-span-7" data-reveal="left" style="--motion-delay: 200ms">
                        <div class=move || if active_step.get() == 0 { "workflow-panel rounded-xl border border-white/10 bg-[#050505] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden" } else { "hidden rounded-xl border border-white/10 bg-[#050505] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden" }>
                            <TerminalInstallPanel copied=copied handle_copy=handle_copy/>
                        </div>
                        <div class=move || if active_step.get() == 1 { "workflow-panel rounded-xl border border-white/10 bg-[#050505] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden" } else { "hidden rounded-xl border border-white/10 bg-[#050505] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden" }>
                            <AddAgentPanel/>
                        </div>
                        <div class=move || if active_step.get() == 2 { "workflow-panel rounded-xl border border-white/10 bg-[#09090B] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden" } else { "hidden rounded-xl border border-white/10 bg-[#09090B] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden" }>
                            <AuditPreviewPanel/>
                        </div>
                        <div class="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600 flex justify-between">
                            <span>"// click steps to preview"</span>
                            <span>"linux · x86_64 / arm64"</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    }
}
