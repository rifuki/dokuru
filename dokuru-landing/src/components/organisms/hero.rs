use super::AuditPanel;
use crate::components::atoms::{Icon, IconKind};
use crate::components::molecules::SupportItem;
use crate::content::APP_URL;
use leptos::prelude::*;

#[component]
pub(crate) fn Hero() -> impl IntoView {
    view! {
        <section id="top" data-testid="hero-section" class="relative min-h-[100svh] flex flex-col justify-center pt-24 pb-20 md:pb-28 overflow-hidden">
            <div class="absolute inset-0 bg-grid-fine mask-fade-b pointer-events-none animate-fade-in"/>

            <div class="relative max-w-7xl mx-auto px-6 md:px-10">
                <div class="animate-enter-soft-down flex flex-wrap items-center gap-x-3 gap-y-2 mb-8" style="--motion-delay: 200ms">
                    <span class="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.02]">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"/>
                        "CIS Docker Benchmark v1.8.0 aligned"
                    </span>
                    <span class="hidden sm:inline font-mono text-[11px] text-zinc-600">"// agent-based · namespace · cgroup · runtime"</span>
                </div>

                <div class="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
                    <div class="lg:col-span-7">
                        <h1 data-testid="hero-headline" class="animate-enter-up font-heading text-4xl sm:text-5xl lg:text-[56px] font-bold tracking-tight leading-[1.05] text-white" style="--motion-delay: 300ms; --motion-duration: 800ms">
                            "Focused Docker"
                            <br/>
                            "security audits."
                            <br/>
                            <span class="relative inline-block mt-1">
                                <span class="text-zinc-300">"Made actionable."</span>
                                <span class="hero-underline absolute -bottom-2 left-0 right-0 h-px bg-[#2496ED]/50 origin-left"/>
                            </span>
                        </h1>

                        <p data-testid="hero-subheadline" class="animate-enter-up mt-6 text-[17px] md:text-[18px] text-zinc-400 leading-relaxed max-w-xl" style="--motion-delay: 500ms; --motion-duration: 600ms">
                            "Dokuru validates your hosts against CIS benchmarks, zeroing in on "
                            <span class="text-zinc-200 font-medium">"namespace isolation"</span>
                            ", "
                            <span class="text-zinc-200 font-medium">"cgroups"</span>
                            ", and "
                            <span class="text-zinc-200 font-medium">"runtime flags"</span>
                            " — with proof for every finding."
                        </p>

                        <div class="animate-enter-up mt-9 flex flex-wrap items-center gap-3" style="--motion-delay: 700ms; --motion-duration: 600ms">
                            <a href=APP_URL target="_blank" rel="noopener noreferrer" data-testid="hero-cta-primary" class="group inline-flex items-center gap-2 bg-[#2496ED] hover:bg-[#1C7CBA] text-white font-medium px-5 py-3 rounded-xl shadow-sm transition-colors active:scale-[0.98]">
                                "Enter App"
                                <Icon kind=IconKind::ArrowRight size=16 class="transition-transform group-hover:translate-x-0.5"/>
                            </a>
                            <a href="#how-it-works" data-testid="hero-cta-secondary" class="inline-flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/25 text-white font-medium px-5 py-3 rounded-xl transition-colors active:scale-[0.98]">
                                <Icon kind=IconKind::Terminal size=16 class="text-[#2496ED]"/>
                                "See How It Works"
                            </a>
                        </div>

                        <ul class="mt-10 grid sm:grid-cols-1 gap-3 max-w-xl">
                            <SupportItem delay_ms=900>"Agent-based Docker host inspection"</SupportItem>
                            <SupportItem delay_ms=1000>"Namespace and cgroup-focused security checks"</SupportItem>
                            <SupportItem delay_ms=1100>"One-click fixes for supported misconfigurations"</SupportItem>
                        </ul>
                    </div>

                    <div class="animate-enter-right lg:col-span-5 lg:pl-4 relative" style="--motion-delay: 600ms">
                        <div class="relative">
                            <div class="relative"><AuditPanel/></div>
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
