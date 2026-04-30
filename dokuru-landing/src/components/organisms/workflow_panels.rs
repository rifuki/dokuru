use crate::components::{
    atoms::{icon::icon, IconKind},
    molecules::{audit_stats, mock_field},
};
use leptos::prelude::*;

#[must_use]
pub(crate) fn terminal_install_panel(
    copied: RwSignal<bool>,
    handle_copy: impl Fn(leptos::ev::MouseEvent) + Copy + 'static,
) -> impl IntoView {
    view! {
        <>
            <div class="flex items-center px-4 py-3 border-b border-white/10 bg-[#0d0d0f]">
                <div class="flex gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/></div>
                <span class="font-mono text-[11px] text-zinc-500 ml-3">"bash · docker-host-01"</span>
                <button on:click=handle_copy class="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400 hover:text-white border border-white/10 hover:border-white/25 rounded px-2 py-1 transition-colors">
                    <span class=move || if copied.get() { "inline-flex items-center gap-1.5" } else { "hidden" }>{icon(IconKind::Check, 11, "", "2")} "copied"</span>
                    <span class=move || if copied.get() { "hidden" } else { "inline-flex items-center gap-1.5" }>{icon(IconKind::Copy, 11, "", "2")} "copy"</span>
                </button>
            </div>
            <div class="p-6 font-mono text-[13px] leading-7 space-y-3 overflow-x-auto">
                <div class="flex items-start gap-3">
                    <span class="text-[#2496ED]">"$"</span>
                    <div class="flex-1"><span class="text-zinc-100">"curl -fsSL "</span><span class="text-[#00E5FF]">"https://dokuru.rifuki.dev/install"</span><span class="text-zinc-100">" | bash"</span></div>
                </div>
                <div class="mt-4 pt-4 border-t border-white/5 text-[12px] space-y-2 text-zinc-400">
                    <div class="text-emerald-400">"✓ Agent installed to /usr/local/bin/dokuru"</div>
                    <div class="text-emerald-400">"✓ Cloudflare Tunnel started"</div>
                    <div class="text-emerald-400">"✓ Service enabled and running"</div>
                    <div class="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                        <div class="text-zinc-500 text-[11px]">"→ Next steps:"</div>
                        <div class="pl-3">
                            <div class="text-zinc-300">"Agent URL: " <span class="text-[#00E5FF]">"https://xxx.trycloudflare.com"</span></div>
                            <div class="text-zinc-300">"Token: " <span class="text-amber-300">"dok_cbb8becb44ca7ace..."</span></div>
                        </div>
                        <div class="text-zinc-500 text-[11px] pl-3 mt-2">"→ Add these to your dashboard"</div>
                    </div>
                </div>
            </div>
        </>
    }
}

#[must_use]
pub(crate) fn add_agent_panel() -> impl IntoView {
    view! {
        <>
            <div class="flex items-center px-4 py-3 border-b border-white/10 bg-[#0d0d0f]">
                <div class="flex gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/></div>
                <span class="font-mono text-[11px] text-zinc-500 ml-3">"app.dokuru.rifuki.dev"</span>
            </div>
            <div class="p-6 space-y-5">
                <div><h3 class="text-xl font-bold text-white mb-1">"Add Docker Agent"</h3><p class="text-sm text-zinc-400">"Connect a new Docker agent to start auditing."</p></div>
                <div class="space-y-4">
                    {mock_field::mock_field("Name", "Production Server", "text-zinc-400")}
                    <div>
                        <label class="block text-sm font-medium text-zinc-300 mb-2">"Access Mode"</label>
                        <div class="bg-[#0d0d0f] border border-[#2496ED]/30 rounded-lg px-3 py-2.5 text-zinc-300 text-sm flex items-center gap-2"><span class="text-[#2496ED]">"☁"</span> "Cloudflare Tunnel (Recommended)"</div>
                    </div>
                    {mock_field::mock_field("Agent URL", "https://xxx.trycloudflare.com", "text-[#00E5FF] text-sm font-mono")}
                    <div>
                        <label class="block text-sm font-medium text-zinc-300 mb-2">"Agent Token"</label>
                        <div class="bg-[#0d0d0f] border border-white/10 rounded-lg px-3 py-2.5 text-amber-300 text-sm font-mono">"dok_••••••••••••••••"</div>
                        <p class="text-xs text-zinc-500 mt-1.5">"Token from agent onboarding (shown once)"</p>
                    </div>
                    <button class="w-full bg-[#2496ED] hover:bg-[#2496ED]/90 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">"Add Agent"</button>
                </div>
            </div>
        </>
    }
}

#[must_use]
pub(crate) fn audit_preview_panel() -> impl IntoView {
    view! {
        <>
            <div class="flex items-center px-4 py-3 border-b border-white/10 bg-[#121214]">
                <div class="flex gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/></div>
                <span class="font-mono text-[11px] text-zinc-500 ml-3">"dokuru-agent " <span class="text-zinc-700">"~"</span> " " <span class="text-zinc-400">"target:"</span> " " <span class="text-[#2496ED]">"prod-cluster-01"</span></span>
                <span class="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"/>"live"</span>
            </div>
            <div class="p-6 space-y-5">
                <div class="flex items-end justify-between border-b border-white/5 pb-5">
                    <div>
                        <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1.5">"audit score"</div>
                        <div class="flex items-baseline gap-1 font-heading"><span class="text-5xl font-black text-amber-400 leading-none">"78"</span><span class="text-lg text-zinc-600 font-bold">"/ 100"</span></div>
                        <div class="mt-2 text-xs text-zinc-500 font-mono">"CIS-aligned · 42 rules evaluated"</div>
                    </div>
                    <div class="flex flex-col items-end gap-1.5 text-right">
                        {audit_stats::preview_count("bg-rose-500", "text-rose-400", "7", "failed")}
                        {audit_stats::preview_count("bg-amber-400", "text-amber-400", "3", "warnings")}
                        {audit_stats::preview_count("bg-emerald-400", "text-emerald-400", "32", "passed")}
                    </div>
                </div>
                <div class="space-y-3">
                    <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">"security pillars"</div>
                    {audit_stats::preview_pillar(IconKind::Box, "Namespace Isolation", "text-[#2496ED] border-[#2496ED]/25", "1/5", "bg-[#2496ED]", "20%")}
                    {audit_stats::preview_pillar(IconKind::Gauge, "Cgroup Controls", "text-[#2496ED] border-[#2496ED]/25", "2/5", "bg-[#2496ED]", "40%")}
                    {audit_stats::preview_pillar(IconKind::Shield, "Runtime Hardening", "text-[#2496ED] border-[#2496ED]/25", "3/6", "bg-[#2496ED]", "50%")}
                </div>
                <div class="flex items-center justify-between border-t border-white/5 pt-4">
                    <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">"run · 2s ago"</div>
                    <div class="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#2496ED]">"apply auto-fixes (9)" <span>"→"</span></div>
                </div>
            </div>
        </>
    }
}
