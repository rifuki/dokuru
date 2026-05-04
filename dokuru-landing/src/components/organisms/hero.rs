use super::audit_panel::audit_panel;
use crate::components::atoms::{icon::icon, IconKind};
use crate::content::APP_URL;
use leptos::prelude::*;

#[must_use]
pub(crate) fn hero() -> impl IntoView {
    view! {
        <section id="top" data-testid="hero-section" class="relative min-h-[92svh] flex flex-col justify-center overflow-hidden px-0 pt-20 pb-16 md:pt-24 md:pb-24">
            <div class="absolute inset-0 bg-grid-fine mask-fade-b pointer-events-none animate-fade-in"/>

            <div class="relative mx-auto w-full max-w-7xl px-6 md:px-10">
                <div class="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)] lg:justify-between lg:gap-16 xl:gap-20">
                    <div class="min-w-0">
                        <h1 data-testid="hero-headline" class="animate-enter-up max-w-[600px] font-heading text-5xl font-bold tracking-tight leading-[1.05] text-white sm:text-6xl lg:text-[56px] xl:text-[60px]" style="--motion-delay: 300ms; --motion-duration: 800ms">
                            "Docker security"
                            <br/>
                            "audits, shipped"
                            <br/>
                            <span class="relative inline-block mt-2">
                                <span class="text-zinc-300">"as an agent."</span>
                                <span class="hero-underline absolute -bottom-2 left-0 right-0 h-px bg-[#2496ED]/50 origin-left"/>
                            </span>
                        </h1>

                        <p data-testid="hero-subheadline" class="animate-enter-up mt-6 max-w-lg text-[16px] leading-relaxed text-zinc-400 md:text-[18px]" style="--motion-delay: 500ms; --motion-duration: 600ms">
                            "Install one lightweight Rust agent on a Docker host. It serves its "
                            <span class="text-zinc-200 font-medium">"own dashboard"</span>
                            " for audits, evidence, and supported fixes — then joins the app when you need multi-host control."
                        </p>

                        <div class="animate-enter-up mt-8 flex flex-wrap items-center gap-3" style="--motion-delay: 700ms; --motion-duration: 600ms">
                            <a href="#how-it-works" data-testid="hero-cta-primary" class="group inline-flex items-center gap-2 rounded-xl bg-[#2496ED] px-5 py-3 font-medium text-white shadow-[0_0_20px_rgba(36,150,237,0.2)] transition-all hover:bg-[#1C7CBA] hover:shadow-[0_0_30px_rgba(36,150,237,0.3)] active:scale-[0.98] sm:px-6 sm:py-3.5">
                                "Install Agent"
                                {icon(IconKind::ArrowRight, 16, "transition-transform group-hover:translate-x-1", "2")}
                            </a>
                            <a href=APP_URL target="_blank" rel="noopener noreferrer" data-testid="hero-cta-secondary" class="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 font-medium text-white transition-colors hover:border-white/25 hover:bg-white/[0.07] active:scale-[0.98] sm:px-6 sm:py-3.5">
                                {icon(IconKind::Terminal, 16, "text-[#2496ED]", "2")}
                                "Open App"
                            </a>
                        </div>

                        <div class="animate-enter-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-zinc-500" style="--motion-delay: 800ms; --motion-duration: 600ms">
                            <span class="flex items-center gap-2">{icon(IconKind::Check, 14, "text-emerald-500", "2")} "Built-in dashboard"</span>
                            <span class="flex items-center gap-2">{icon(IconKind::Check, 14, "text-emerald-500", "2")} "Rule-level evidence"</span>
                            <span class="flex items-center gap-2">{icon(IconKind::Check, 14, "text-emerald-500", "2")} "Supported fixes"</span>
                        </div>
                    </div>

                    <div class="animate-enter-right relative w-full max-w-[560px] justify-self-center lg:justify-self-end" style="--motion-delay: 600ms">
                        <div class="absolute inset-0 scale-90 rounded-full bg-[#2496ED]/10 blur-[96px]"/>
                        <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050505] shadow-[0_0_54px_rgba(0,0,0,0.78)]">
                            {audit_panel()}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    }
}
