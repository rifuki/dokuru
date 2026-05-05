use super::audit_panel::audit_panel;
use crate::components::atoms::{icon::icon, IconKind};
use crate::content::APP_URL;
use leptos::prelude::*;

#[must_use]
pub(crate) fn hero() -> impl IntoView {
    view! {
        <div class="flex flex-col">
            <section id="top" data-testid="hero-section" class="relative min-h-[90svh] flex flex-col justify-center overflow-hidden px-0 pt-20">
                <div class="absolute inset-0 bg-grid-fine mask-fade-b pointer-events-none animate-fade-in"/>

                <div class="relative mx-auto w-full max-w-4xl px-6 md:px-10 text-center">
                    <h1 data-testid="hero-headline" class="animate-enter-up font-heading text-5xl font-bold tracking-tight leading-[1.1] text-white sm:text-6xl lg:text-[76px]" style="--motion-delay: 300ms; --motion-duration: 800ms">
                        "Docker security audits,"
                        <br/>
                        "shipped "
                        <span class="relative inline-block whitespace-nowrap">
                            <span class="text-zinc-300">"as an agent."</span>
                            <span class="hero-underline absolute -bottom-2 left-0 right-0 h-px bg-[#2496ED]/50 origin-center"/>
                        </span>
                    </h1>

                    <p data-testid="hero-subheadline" class="animate-enter-up mx-auto mt-8 max-w-2xl text-[16px] leading-relaxed text-zinc-400 md:text-[20px]" style="--motion-delay: 500ms; --motion-duration: 600ms">
                        "Install one lightweight Rust agent on a Docker host. It serves its "
                        <span class="text-zinc-200 font-medium">"own dashboard"</span>
                        " for audits, evidence, and supported fixes — then joins the app when you need multi-host control."
                    </p>

                    <div class="animate-enter-up mt-10 flex flex-wrap items-center justify-center gap-4" style="--motion-delay: 700ms; --motion-duration: 600ms">
                        <a href="#how-it-works" data-testid="hero-cta-primary" class="group inline-flex items-center gap-2 rounded-xl bg-[#2496ED] px-6 py-4 font-medium text-white shadow-[0_0_20px_rgba(36,150,237,0.2)] transition-all hover:bg-[#1C7CBA] hover:shadow-[0_0_30px_rgba(36,150,237,0.3)] active:scale-[0.98]">
                            "Install Agent"
                            {icon(IconKind::ArrowRight, 16, "transition-transform group-hover:translate-x-1", "2")}
                        </a>
                        <a href=APP_URL target="_blank" rel="noopener noreferrer" data-testid="hero-cta-secondary" class="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-4 font-medium text-white transition-colors hover:border-white/25 hover:bg-white/[0.07] active:scale-[0.98]">
                            {icon(IconKind::Terminal, 16, "text-[#2496ED]", "2")}
                            "Open App"
                        </a>
                    </div>

                    <div class="animate-enter-up mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm font-medium text-zinc-500" style="--motion-delay: 800ms; --motion-duration: 600ms">
                        <span class="flex items-center gap-2">{icon(IconKind::Check, 16, "text-emerald-500", "2")} "Built-in dashboard"</span>
                        <span class="flex items-center gap-2">{icon(IconKind::Check, 16, "text-emerald-500", "2")} "Rule-level evidence"</span>
                        <span class="flex items-center gap-2">{icon(IconKind::Check, 16, "text-emerald-500", "2")} "Supported fixes"</span>
                    </div>
                </div>
            </section>

            <section id="preview" data-testid="preview-section" class="relative pb-24 md:pb-32 px-6 md:px-10">
                <div class="relative mx-auto w-full max-w-4xl">
                    <div class="animate-enter-up relative" style="--motion-delay: 900ms">
                        <div class="absolute inset-0 scale-95 rounded-full bg-[#2496ED]/10 blur-[120px]"/>
                        <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050505] shadow-[0_0_54px_rgba(0,0,0,0.78)] text-left ring-1 ring-white/5">
                            {audit_panel()}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    }
}
