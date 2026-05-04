use super::audit_panel::audit_panel;
use crate::components::atoms::{icon::icon, IconKind};
use crate::content::APP_URL;
use leptos::prelude::*;

#[must_use]
pub(crate) fn hero() -> impl IntoView {
    view! {
        <section id="top" data-testid="hero-section" class="relative min-h-[100svh] flex flex-col justify-center pt-24 pb-20 md:pb-28 overflow-hidden">
            <div class="absolute inset-0 bg-grid-fine mask-fade-b pointer-events-none animate-fade-in"/>

            <div class="relative mx-auto w-full max-w-[1500px] px-6 md:px-10">
                <div class="grid items-center gap-12 lg:grid-cols-2 xl:gap-16">
                    <div class="min-w-0">
                        <h1 data-testid="hero-headline" class="animate-enter-up font-heading text-5xl sm:text-6xl lg:text-[64px] xl:text-[72px] font-bold tracking-tight leading-[1.05] text-white" style="--motion-delay: 300ms; --motion-duration: 800ms">
                            "Docker security"
                            <br/>
                            "audits, shipped"
                            <br/>
                            <span class="relative inline-block mt-2">
                                <span class="text-zinc-300">"as an agent."</span>
                                <span class="hero-underline absolute -bottom-2 left-0 right-0 h-px bg-[#2496ED]/50 origin-left"/>
                            </span>
                        </h1>

                        <p data-testid="hero-subheadline" class="animate-enter-up mt-8 text-[17px] md:text-[19px] text-zinc-400 leading-relaxed max-w-xl" style="--motion-delay: 500ms; --motion-duration: 600ms">
                            "Install one lightweight Rust agent on a Docker host. It serves its "
                            <span class="text-zinc-200 font-medium">"own dashboard"</span>
                            " for audits, evidence, and supported fixes — then joins the app when you need multi-host control."
                        </p>

                        <div class="animate-enter-up mt-10 flex flex-wrap items-center gap-4" style="--motion-delay: 700ms; --motion-duration: 600ms">
                            <a href="#how-it-works" data-testid="hero-cta-primary" class="group inline-flex items-center gap-2 bg-[#2496ED] hover:bg-[#1C7CBA] text-white font-medium px-6 py-3.5 rounded-xl shadow-[0_0_20px_rgba(36,150,237,0.2)] hover:shadow-[0_0_30px_rgba(36,150,237,0.3)] transition-all active:scale-[0.98]">
                                "Install Agent"
                                {icon(IconKind::ArrowRight, 16, "transition-transform group-hover:translate-x-1", "2")}
                            </a>
                            <a href=APP_URL target="_blank" rel="noopener noreferrer" data-testid="hero-cta-secondary" class="inline-flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/25 text-white font-medium px-6 py-3.5 rounded-xl transition-colors active:scale-[0.98]">
                                {icon(IconKind::Terminal, 16, "text-[#2496ED]", "2")}
                                "Open App"
                            </a>
                        </div>

                        <div class="animate-enter-up mt-10 flex items-center gap-6 text-sm text-zinc-500 font-medium" style="--motion-delay: 800ms; --motion-duration: 600ms">
                            <span class="flex items-center gap-2">{icon(IconKind::Check, 14, "text-emerald-500", "2")} "Built-in dashboard"</span>
                            <span class="flex items-center gap-2">{icon(IconKind::Check, 14, "text-emerald-500", "2")} "Rule-level evidence"</span>
                            <span class="flex items-center gap-2">{icon(IconKind::Check, 14, "text-emerald-500", "2")} "Supported fixes"</span>
                        </div>
                    </div>

                    <div class="animate-enter-right relative min-w-0 xl:-mr-6" style="--motion-delay: 600ms">
                        <div class="absolute inset-0 scale-95 rounded-full bg-[#2496ED]/10 blur-[120px]"/>
                        <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050505] shadow-[0_0_70px_rgba(0,0,0,0.82)]">
                            {audit_panel()}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    }
}
