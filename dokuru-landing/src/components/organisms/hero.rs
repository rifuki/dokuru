use super::audit_panel::audit_panel;
use crate::components::atoms::{icon::icon, IconKind};
use crate::content::APP_URL;
use leptos::prelude::*;

#[must_use]
pub(crate) fn hero() -> impl IntoView {
    view! {
        <div class="flex flex-col">
            <section id="top" data-testid="hero-section" class="relative min-h-[100svh] flex flex-col justify-center overflow-hidden px-0">
                <div class="absolute inset-0 bg-grid-fine mask-fade-b pointer-events-none animate-fade-in"/>

                // Top heavenly glow
                <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[400px] bg-[#2496ED]/15 blur-[120px] pointer-events-none rounded-full"/>

                <div class="relative mx-auto w-full max-w-4xl px-6 md:px-10 text-center flex flex-col items-center">

                    <a href="https://github.com/rifuki/dokuru" target="_blank" rel="noopener noreferrer" class="animate-enter-up mb-8 inline-flex items-center gap-2.5 rounded-full border border-[#2496ED]/20 bg-[#2496ED]/10 px-3 py-1.5 text-sm font-medium text-[#2496ED] transition-colors hover:bg-[#2496ED]/20" style="--motion-delay: 200ms; --motion-duration: 800ms">
                        <span class="flex h-1.5 w-1.5 rounded-full bg-[#2496ED] shadow-[0_0_8px_#2496ED]"/>
                        <span>"Dokuru is Open Source"</span>
                        {icon(IconKind::ArrowRight, 14, "opacity-70", "2")}
                    </a>

                    <h1 data-testid="hero-headline" class="animate-enter-up font-heading text-5xl font-bold tracking-tight leading-[1.1] text-white sm:text-6xl lg:text-[76px]" style="--motion-delay: 300ms; --motion-duration: 800ms">
                        "Docker security audits,"
                        <br/>
                        "shipped "
                        <span class="relative inline-block whitespace-nowrap">
                            <span class="bg-gradient-to-r from-[#2496ED] to-[#38BDF8] bg-clip-text text-transparent">"as an agent."</span>
                            <span class="absolute -bottom-1 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2496ED]/0 via-[#2496ED] to-[#2496ED]/0"/>
                        </span>
                    </h1>

                    <p data-testid="hero-subheadline" class="animate-enter-up mx-auto mt-8 max-w-2xl text-[16px] leading-relaxed text-zinc-400 md:text-[20px]" style="--motion-delay: 500ms; --motion-duration: 600ms">
                        "Install one lightweight Rust agent on a Docker host. It serves its "
                        <span class="text-zinc-200 font-medium">"own dashboard"</span>
                        " for audits, evidence, and supported fixes — then joins the app when you need multi-host control."
                    </p>

                    <div class="animate-enter-up mt-10 flex flex-wrap items-center justify-center gap-4" style="--motion-delay: 700ms; --motion-duration: 600ms">
                        <a href="#how-it-works" data-testid="hero-cta-primary" class="group inline-flex items-center gap-2 rounded-xl bg-[#2496ED] px-7 py-3.5 font-medium text-white shadow-[0_0_30px_rgba(36,150,237,0.3)] transition-all hover:bg-[#1C7CBA] hover:shadow-[0_0_40px_rgba(36,150,237,0.4)] active:scale-[0.98]">
                            "Install Agent"
                            {icon(IconKind::ArrowRight, 16, "transition-transform group-hover:translate-x-1", "2")}
                        </a>
                        <a href=APP_URL target="_blank" rel="noopener noreferrer" data-testid="hero-cta-secondary" class="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-7 py-3.5 font-medium text-white backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.98]">
                            {icon(IconKind::Terminal, 16, "text-zinc-400 transition-colors group-hover:text-white", "2")}
                            "Open App"
                        </a>
                    </div>

                    <div class="animate-enter-up mt-12 flex flex-wrap items-center justify-center gap-3 md:gap-4" style="--motion-delay: 800ms; --motion-duration: 600ms">
                        <div class="flex items-center gap-2.5 rounded-full border border-white/5 bg-white/[0.02] pl-1.5 pr-4 py-1.5 text-sm font-medium text-zinc-400 backdrop-blur-md">
                            <div class="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                                {icon(IconKind::Check, 12, "", "2.5")}
                            </div>
                            "Built-in dashboard"
                        </div>
                        <div class="flex items-center gap-2.5 rounded-full border border-white/5 bg-white/[0.02] pl-1.5 pr-4 py-1.5 text-sm font-medium text-zinc-400 backdrop-blur-md">
                            <div class="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                                {icon(IconKind::Check, 12, "", "2.5")}
                            </div>
                            "Rule-level evidence"
                        </div>
                        <div class="flex items-center gap-2.5 rounded-full border border-white/5 bg-white/[0.02] pl-1.5 pr-4 py-1.5 text-sm font-medium text-zinc-400 backdrop-blur-md">
                            <div class="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                                {icon(IconKind::Check, 12, "", "2.5")}
                            </div>
                            "Supported fixes"
                        </div>
                    </div>
                </div>
            </section>

            <section id="preview" data-testid="preview-section" class="relative min-h-[100svh] flex flex-col justify-center px-6 md:px-10">
                <div class="mb-10 text-center animate-enter-up" style="--motion-delay: 200ms">
                    <h2 class="font-heading text-2xl font-bold text-white md:text-4xl">"Real-time security at a glance"</h2>
                    <p class="mt-3 text-sm text-zinc-400 md:text-base">"The agent serves its own dashboard with live metrics and auto-fixes."</p>
                </div>
                <div class="relative mx-auto w-full max-w-3xl">
                    <div class="animate-enter-up relative" style="--motion-delay: 400ms">
                        <div class="absolute inset-0 scale-90 rounded-full bg-[#2496ED]/10 blur-[100px]"/>
                        <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050505] shadow-[0_0_54px_rgba(0,0,0,0.78)] text-left ring-1 ring-white/5">
                            {audit_panel()}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    }
}
