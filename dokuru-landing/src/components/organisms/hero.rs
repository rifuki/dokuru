use super::audit_panel::audit_panel;
use crate::components::atoms::{icon::icon, IconKind};
use crate::content::APP_URL;
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[must_use]
pub(crate) fn hero() -> impl IntoView {
    let (fixing, set_fixing) = signal(false);

    view! {
        <div class="flex flex-col">
            {hero_top()}
            {preview_section(fixing, set_fixing)}
        </div>
    }
}

fn hero_top() -> impl IntoView {
    view! {
        <section id="top" data-testid="hero-section" class="relative flex min-h-[100svh] flex-col justify-center overflow-hidden px-0 pb-8 pt-20 sm:pt-0 sm:pb-0">
            <div class="absolute inset-0 bg-grid-fine mask-fade-b pointer-events-none animate-fade-in"/>
            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[400px] bg-[#2496ED]/15 blur-[120px] pointer-events-none rounded-full"/>

            <div class="relative mx-auto flex w-full max-w-4xl flex-col items-start px-5 text-left sm:items-center sm:px-6 sm:text-center md:px-10">
                <a href="https://github.com/rifuki/dokuru" target="_blank" rel="noopener noreferrer" class="animate-enter-up mb-5 inline-flex items-center gap-2 rounded-full border border-[#2496ED]/20 bg-[#2496ED]/10 px-2.5 py-1 text-xs font-medium text-[#2496ED] transition-colors hover:bg-[#2496ED]/20 sm:mb-8 sm:gap-2.5 sm:px-3 sm:py-1.5 sm:text-sm" style="--motion-delay: 200ms; --motion-duration: 800ms">
                    <span class="flex h-1.5 w-1.5 rounded-full bg-[#2496ED] shadow-[0_0_8px_#2496ED]"/>
                    <span>"Dokuru is Open Source"</span>
                    {icon(IconKind::ArrowRight, 14, "opacity-70", "2")}
                </a>

                {hero_headlines()}
                {hero_subheadline()}
                {hero_actions()}
                {hero_feature_pills()}
            </div>
        </section>
    }
}

fn hero_headlines() -> impl IntoView {
    view! {
        <>
            <h1 data-testid="hero-headline" class="animate-enter-up font-heading text-[44px] font-bold tracking-tight leading-[1] text-white sm:hidden" style="--motion-delay: 300ms; --motion-duration: 800ms">
                "Docker audits,"<br/>"shipped as"<br/>
                <span class="relative inline-block whitespace-nowrap">
                    <span class="bg-gradient-to-r from-[#2496ED] to-[#38BDF8] bg-clip-text text-transparent">"an agent."</span>
                    <span class="absolute -bottom-1 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2496ED]/0 via-[#2496ED] to-[#2496ED]/0"/>
                </span>
            </h1>

            <h1 class="animate-enter-up hidden font-heading font-bold tracking-tight text-white sm:block sm:text-6xl sm:leading-[1.08] lg:text-[76px] lg:leading-[1.1]" style="--motion-delay: 300ms; --motion-duration: 800ms">
                "Docker security audits,"<br/>"shipped "
                <span class="relative inline-block whitespace-nowrap">
                    <span class="bg-gradient-to-r from-[#2496ED] to-[#38BDF8] bg-clip-text text-transparent">"as an agent."</span>
                    <span class="absolute -bottom-1 left-0 right-0 h-[2px] bg-gradient-to-r from-[#2496ED]/0 via-[#2496ED] to-[#2496ED]/0"/>
                </span>
            </h1>
        </>
    }
}

fn hero_subheadline() -> impl IntoView {
    view! {
        <p data-testid="hero-subheadline" class="animate-enter-up mt-6 max-w-[22rem] text-[16px] leading-7 text-zinc-400 sm:mx-auto sm:mt-8 sm:max-w-2xl sm:leading-relaxed md:text-[20px]" style="--motion-delay: 500ms; --motion-duration: 600ms">
            <span class="sm:hidden">
                "Run CIS-aligned Docker checks, review evidence, and apply supported fixes from one lightweight Rust agent."
            </span>
            <span class="hidden sm:inline">
                "Install one lightweight Rust agent on a Docker host. It serves its "
                <span class="text-zinc-200 font-medium">"own dashboard"</span>
                " for audits, evidence, and supported fixes — then joins the app when you need multi-host control."
            </span>
        </p>
    }
}

fn hero_actions() -> impl IntoView {
    view! {
        <div class="animate-enter-up mt-8 flex w-full flex-wrap items-center justify-start gap-3 sm:mt-10 sm:w-auto sm:justify-center sm:gap-4" style="--motion-delay: 700ms; --motion-duration: 600ms">
            <a href="#how-it-works" data-testid="hero-cta-primary" class="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#2496ED] px-6 py-3.5 text-base font-medium text-white shadow-[0_0_30px_rgba(36,150,237,0.3)] transition-all hover:bg-[#1C7CBA] hover:shadow-[0_0_40px_rgba(36,150,237,0.4)] active:scale-[0.98] sm:px-7 sm:text-base">
                "Install Agent"
                {icon(IconKind::ArrowRight, 16, "transition-transform group-hover:translate-x-1", "2")}
            </a>
            <a href=APP_URL target="_blank" rel="noopener noreferrer" data-testid="hero-cta-secondary" class="group hidden items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-7 py-3.5 font-medium text-white backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.98] sm:inline-flex">
                {icon(IconKind::Terminal, 16, "text-zinc-400 transition-colors group-hover:text-white", "2")}
                "Open App"
            </a>
        </div>
    }
}

fn hero_feature_pills() -> impl IntoView {
    view! {
        <div class="animate-enter-up mt-8 flex max-w-[22rem] flex-wrap items-center justify-start gap-2 sm:mt-12 sm:max-w-none sm:justify-center sm:gap-3 md:gap-4" style="--motion-delay: 800ms; --motion-duration: 600ms">
            {hero_feature_pill("Built-in dashboard")}
            {hero_feature_pill("Rule-level evidence")}
            {hero_feature_pill("Supported fixes")}
        </div>
    }
}

fn hero_feature_pill(label: &'static str) -> impl IntoView {
    view! {
        <div class="flex items-center gap-2 rounded-full border border-white/5 bg-white/[0.02] pl-1.5 pr-3 py-1.5 text-xs font-medium text-zinc-400 backdrop-blur-md sm:gap-2.5 sm:pr-4 sm:text-sm">
            <div class="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 sm:h-6 sm:w-6">
                {icon(IconKind::Check, 12, "", "2.5")}
            </div>
            {label}
        </div>
    }
}

fn preview_section(fixing: ReadSignal<bool>, set_fixing: WriteSignal<bool>) -> impl IntoView {
    view! {
        <section id="preview" data-testid="preview-section" class="relative px-4 py-20 sm:px-6 md:px-10 md:py-28 lg:min-h-[100svh] lg:flex lg:flex-col lg:justify-center lg:py-32 overflow-hidden">
            {preview_heading()}

            <div class="relative mx-auto flex h-[680px] w-full max-w-6xl items-center justify-center sm:h-[620px] lg:h-[650px]">
                {preview_mobile_layers()}
                {preview_desktop_layers()}
                {preview_audit_panel(fixing, set_fixing)}
            </div>

            {fix_toast(fixing)}
        </section>
    }
}

fn preview_heading() -> impl IntoView {
    let preview_heading_ref = reveal_ref::<html::Div>();

    view! {
        <div node_ref=preview_heading_ref class="reveal relative z-50 mx-auto mb-8 max-w-2xl text-center sm:mb-12 lg:mb-16" style="--motion-delay: 100ms; --motion-duration: 650ms">
            <h2 class="font-heading text-[28px] font-bold leading-tight text-white md:text-4xl">"The complete security workflow"</h2>
            <p class="mt-4 text-sm text-zinc-400 md:text-base max-w-2xl mx-auto">"Seamless onboarding, real-time scanning, and 1-click auto-fixes — all orchestrated by a single lightweight agent."</p>
        </div>
    }
}

fn preview_mobile_layers() -> impl IntoView {
    view! {
        <>
            <div class="pointer-events-none absolute -left-24 top-6 z-10 w-[360px] -rotate-6 opacity-35 lg:hidden">
                <div class="origin-top-left scale-[0.72]">{onboard_terminal()}</div>
            </div>

            <div class="pointer-events-none absolute -right-20 top-14 z-20 w-[300px] rotate-6 opacity-80 lg:hidden">
                <div class="origin-top-right scale-[0.78]">{fix_alert()}</div>
            </div>

            <div class="pointer-events-none absolute -left-12 bottom-16 z-20 w-[250px] -rotate-3 opacity-70 lg:hidden">
                <div class="origin-bottom-left scale-[0.82]">{agent_telemetry()}</div>
            </div>

            <div class="pointer-events-none absolute -right-28 bottom-8 z-10 w-[360px] rotate-3 opacity-30 lg:hidden">
                <div class="origin-bottom-right scale-[0.76]">{scanning_terminal()}</div>
            </div>
        </>
    }
}

fn preview_desktop_layers() -> impl IntoView {
    let onboard_ref = reveal_ref::<html::Div>();
    let scanning_ref = reveal_ref::<html::Div>();
    let fix_alert_ref = reveal_ref::<html::Div>();
    let telemetry_ref = reveal_ref::<html::Div>();

    view! {
        <>
            <div node_ref=onboard_ref class="reveal group absolute left-0 lg:-left-4 top-4 hidden lg:block w-[440px] z-10 hover:z-50" data-reveal="right" style="--motion-delay: 180ms; --motion-duration: 650ms">
                <div class="w-full -rotate-3 opacity-40 transition-all duration-500 group-hover:rotate-0 group-hover:opacity-100 group-hover:scale-105">{onboard_terminal()}</div>
            </div>

            <div node_ref=scanning_ref class="reveal group absolute right-0 lg:-right-4 bottom-10 hidden lg:block w-[400px] z-20 hover:z-50" data-reveal="left" style="--motion-delay: 320ms; --motion-duration: 650ms">
                <div class="w-full rotate-2 opacity-50 transition-all duration-500 group-hover:rotate-0 group-hover:opacity-100 group-hover:scale-105">{scanning_terminal()}</div>
            </div>

            <div node_ref=fix_alert_ref class="reveal group absolute right-10 lg:right-0 top-10 hidden lg:block w-[320px] z-20 hover:z-50" data-reveal="left" style="--motion-delay: 460ms; --motion-duration: 650ms">
                <div class="w-full rotate-3 opacity-90 transition-all duration-500 group-hover:rotate-0 group-hover:opacity-100 group-hover:scale-105">{fix_alert()}</div>
            </div>

            <div node_ref=telemetry_ref class="reveal group absolute left-10 lg:-left-2 bottom-6 hidden lg:block w-[280px] z-20 hover:z-50" data-reveal="right" style="--motion-delay: 600ms; --motion-duration: 650ms">
                <div class="w-full -rotate-2 opacity-80 transition-all duration-500 group-hover:rotate-0 group-hover:opacity-100 group-hover:scale-105">{agent_telemetry()}</div>
            </div>
        </>
    }
}

fn preview_audit_panel(fixing: ReadSignal<bool>, set_fixing: WriteSignal<bool>) -> impl IntoView {
    let audit_panel_ref = reveal_ref::<html::Div>();

    view! {
        <div node_ref=audit_panel_ref class="reveal relative z-30 w-full max-w-[720px]" style="--motion-delay: 260ms; --motion-duration: 700ms">
            <div class="transition-transform duration-500 hover:scale-[1.02]">
                <div class="absolute inset-0 scale-90 rounded-full bg-[#2496ED]/15 blur-[120px] pointer-events-none"/>
                <div class="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050505] shadow-[0_40px_100px_rgba(0,0,0,0.9)] text-left ring-1 ring-white/5 backdrop-blur-xl">
                    {audit_panel(fixing, set_fixing)}
                </div>
            </div>
        </div>
    }
}

fn fix_toast(fixing: ReadSignal<bool>) -> impl IntoView {
    view! {
        {move || fixing.get().then(|| view! {
            <div class="fixed bottom-5 left-4 right-4 animate-enter-up z-[9999] pointer-events-none sm:left-auto sm:right-6">
                <div class="mx-auto flex w-full max-w-[320px] items-start gap-3 rounded-xl border border-white/10 bg-[#09090B]/95 px-5 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:mx-0">
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
    }
}

fn onboard_terminal() -> impl IntoView {
    view! {
        <div class="w-full rounded-xl border border-white/10 bg-[#050505] shadow-2xl overflow-hidden font-mono text-[11px] leading-relaxed text-zinc-300 ring-1 ring-white/5">
            <div class="flex items-center gap-1.5 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
                <div class="h-2.5 w-2.5 rounded-full bg-[#FF5F56]"></div>
                <div class="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]"></div>
                <div class="h-2.5 w-2.5 rounded-full bg-[#27C93F]"></div>
                <div class="ml-2 text-[10px] text-zinc-500 font-sans">"root@debian13-2c4g-dokuru-lab:~"</div>
            </div>
            <div class="p-5 space-y-2 opacity-90">
                <div class="flex gap-2">
                    <span class="text-[#2496ED]">"❯"</span>
                    <span class="text-white">"dokuru onboard"</span>
                </div>
                <div class="text-zinc-400">"┌  🐳 Dokuru onboard"</div>
                <div class="text-zinc-400">"│"</div>
                <div class="text-zinc-400">"◇  Preflight"</div>
                <div class="pl-4 text-zinc-500">
                    "Distribution:   Debian GNU/Linux 13 (trixie)"<br/>
                    "Docker:         installed "<span class="text-emerald-400">"✓"</span><br/>
                    "Docker socket:  /var/run/docker.sock "<span class="text-emerald-400">"✓"</span>
                </div>
                <div class="text-zinc-400">"│"</div>
                <div class="text-zinc-400">"◇  Starting Cloudflare Tunnel..."</div>
                <div class="pl-4 text-emerald-400">"✓ Tunnel started: https://spears-clinical.trycloudflare.com"</div>
                <div class="text-zinc-400">"│"</div>
                <div class="text-zinc-400">"└  Dokuru is ready."</div>
                <div class="flex gap-2 pt-2 animate-pulse">
                    <span class="text-[#2496ED]">"❯"</span>
                    <span class="w-2 h-3 bg-zinc-400 inline-block"></span>
                </div>
            </div>
        </div>
    }
}

fn scanning_terminal() -> impl IntoView {
    view! {
        <div class="w-full rounded-xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden font-mono text-[10px] leading-relaxed text-zinc-400 ring-1 ring-white/5">
            <div class="flex items-center gap-1.5 border-b border-white/5 bg-white/[0.02] px-4 py-2">
                <div class="h-2 w-2 rounded-full bg-[#FF5F56]"></div>
                <div class="h-2 w-2 rounded-full bg-[#FFBD2E]"></div>
                <div class="h-2 w-2 rounded-full bg-[#27C93F]"></div>
                <div class="ml-2 text-[9px] text-zinc-600 font-sans">"dokuru-audit.log"</div>
            </div>
            <div class="p-4 space-y-1 opacity-90">
                <div><span class="text-zinc-500">"[14:02:11]"</span> " Scanning Docker daemon configuration..."</div>
                <div class="text-emerald-400">"✓ TLS authentication enabled"</div>
                <div class="text-rose-400">"✗ Userland proxy is enabled (CIS 2.11)"</div>
                <div><span class="text-zinc-500">"[14:02:12]"</span> " Inspecting running containers (8 found)..."</div>
                <div><span class="text-zinc-500">"[14:02:13]"</span> " Analyzing namespace isolation..."</div>
                <div class="text-emerald-400">"✓ Container 'brave_lion' uses private namespaces"</div>
                <div class="text-emerald-400">"✓ Container 'web_proxy' uses private namespaces"</div>
                <div><span class="text-zinc-500">"[14:02:14]"</span> " Checking cgroup resource limits..."</div>
                <div class="flex gap-2 pt-1 animate-pulse">
                    <span class="text-[#2496ED]">"▶"</span>
                    <span class="w-1.5 h-2.5 bg-zinc-400 inline-block"></span>
                </div>
            </div>
        </div>
    }
}

fn fix_alert() -> impl IntoView {
    view! {
        <div class="w-full rounded-xl border border-[#2496ED]/30 bg-[#050505]/90 shadow-[0_20px_40px_rgba(36,150,237,0.15)] overflow-hidden font-sans text-sm backdrop-blur-xl ring-1 ring-white/10">
            <div class="flex items-start gap-4 p-4">
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2496ED]/20 text-[#2496ED] shadow-[0_0_15px_rgba(36,150,237,0.4)]">
                    {icon(IconKind::Wrench, 14, "", "2")}
                </div>
                <div class="flex-1 space-y-1">
                    <p class="font-bold text-white">"Auto-fix applied"</p>
                    <p class="text-[12px] text-zinc-400">"Restricted cgroup memory limit for "<span class="font-mono text-[#2496ED]">"redis_cache"</span></p>
                    <div class="mt-2 text-[10px] font-mono text-emerald-400">"Resolved in 14ms"</div>
                </div>
            </div>
        </div>
    }
}

fn agent_telemetry() -> impl IntoView {
    view! {
        <div class="overflow-hidden rounded-xl border border-white/10 bg-[#09090B]/90 shadow-2xl backdrop-blur-xl ring-1 ring-white/5">
            <div class="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-4 py-2.5">
                <div class="flex items-center gap-2">
                    {icon(IconKind::Activity, 14, "text-emerald-400", "2")}
                    <span class="font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-300">"Agent Telemetry"</span>
                </div>
                <span class="flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"/>
            </div>
            <div class="flex flex-col gap-3 p-4">
                <div class="flex justify-between items-center">
                    <span class="text-[12px] text-zinc-500">"CPU Usage"</span>
                    <span class="font-mono text-[12px] font-medium text-zinc-200">"0.2%"</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-[12px] text-zinc-500">"Memory Footprint"</span>
                    <span class="font-mono text-[12px] font-medium text-emerald-400">"14.5 MB"</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-[12px] text-zinc-500">"Uptime"</span>
                    <span class="font-mono text-[12px] font-medium text-zinc-200">"24d 12h"</span>
                </div>
                <div class="mt-1 h-8 w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjQwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0wIDIwIFExMCAxMCAyMCAyMCBUMDQwIDIwIFQ2MCAyMCBUODAgMjAgVDEwMCAyMCBUMTIwIDIwIFQxNDAgMjAgVDE2MCAyMCBUMTgwIDIwIFQyMDAgMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSg1MiwgMjExLCAxNTMsIDAuMykiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==')] bg-cover bg-center opacity-70 mask-fade-x"></div>
            </div>
        </div>
    }
}
