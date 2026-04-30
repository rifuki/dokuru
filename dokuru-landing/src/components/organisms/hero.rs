use super::audit_panel::audit_panel;
use crate::components::atoms::{icon::icon, IconKind};
use crate::content::APP_URL;
use leptos::prelude::*;

#[must_use]
pub(crate) fn hero() -> impl IntoView {
    view! {
        <section id="top" data-testid="hero-section" class="relative min-h-[100svh] flex flex-col justify-center pt-24 pb-20 md:pb-28 overflow-hidden">
            <div class="absolute inset-0 bg-grid-fine mask-fade-b pointer-events-none animate-fade-in"/>

            <div class="relative max-w-7xl mx-auto px-6 md:px-10 w-full">
                <div class="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
                    <div class="lg:col-span-7">
                        <h1 data-testid="hero-headline" class="animate-enter-up font-heading text-5xl sm:text-6xl lg:text-[64px] xl:text-[72px] font-bold tracking-tight leading-[1.05] text-white" style="--motion-delay: 300ms; --motion-duration: 800ms">
                            "Focused Docker"
                            <br/>
                            "security audits."
                            <br/>
                            <span class="relative inline-block mt-2">
                                <span class="text-zinc-300">"Made actionable."</span>
                                <span class="hero-underline absolute -bottom-2 left-0 right-0 h-px bg-[#2496ED]/50 origin-left"/>
                            </span>
                        </h1>

                        <p data-testid="hero-subheadline" class="animate-enter-up mt-8 text-[17px] md:text-[19px] text-zinc-400 leading-relaxed max-w-xl" style="--motion-delay: 500ms; --motion-duration: 600ms">
                            "Dokuru validates your hosts against CIS benchmarks, zeroing in on "
                            <span class="text-zinc-200 font-medium">"namespace isolation"</span>
                            ", "
                            <span class="text-zinc-200 font-medium">"cgroups"</span>
                            ", and "
                            <span class="text-zinc-200 font-medium">"runtime flags"</span>
                            " — with proof for every finding."
                        </p>

                        <div class="animate-enter-up mt-10 flex flex-wrap items-center gap-4" style="--motion-delay: 700ms; --motion-duration: 600ms">
                            <a href=APP_URL target="_blank" rel="noopener noreferrer" data-testid="hero-cta-primary" class="group inline-flex items-center gap-2 bg-[#2496ED] hover:bg-[#1C7CBA] text-white font-medium px-6 py-3.5 rounded-xl shadow-[0_0_20px_rgba(36,150,237,0.2)] hover:shadow-[0_0_30px_rgba(36,150,237,0.3)] transition-all active:scale-[0.98]">
                                "Enter App"
                                {icon(IconKind::ArrowRight, 16, "transition-transform group-hover:translate-x-1", "2")}
                            </a>
                            <a href="#how-it-works" data-testid="hero-cta-secondary" class="inline-flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/25 text-white font-medium px-6 py-3.5 rounded-xl transition-colors active:scale-[0.98]">
                                {icon(IconKind::Terminal, 16, "text-[#2496ED]", "2")}
                                "See How It Works"
                            </a>
                        </div>

                        <div class="animate-enter-up mt-10 flex items-center gap-6 text-sm text-zinc-500 font-medium" style="--motion-delay: 800ms; --motion-duration: 600ms">
                            <span class="flex items-center gap-2">{icon(IconKind::Check, 14, "text-emerald-500", "2")} "No vague scores"</span>
                            <span class="flex items-center gap-2">{icon(IconKind::Check, 14, "text-emerald-500", "2")} "Rule-level evidence"</span>
                            <span class="flex items-center gap-2">{icon(IconKind::Check, 14, "text-emerald-500", "2")} "One-click fixes"</span>
                        </div>
                    </div>

                    <div class="animate-enter-right lg:col-span-5 relative lg:pl-4" style="--motion-delay: 600ms">
                        <div class="absolute inset-0 bg-[#2496ED]/10 blur-[100px] rounded-full scale-90"/>
                        <div class="relative rounded-xl border border-white/10 bg-[#050505] shadow-[0_0_40px_rgba(0,0,0,0.8)] overflow-hidden">
                            {audit_panel()}
                        </div>
                        <div class="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                            <span>"// fig.01 — audit summary"</span>
                            <span>"dokuru/dashboard"</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    }
}
