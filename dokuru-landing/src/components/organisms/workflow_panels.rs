use crate::components::{
    atoms::{icon::icon, IconKind},
    molecules::audit_stats,
};
use crate::content::AUDIT_SECTIONS;
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
                <button on:click=handle_copy class="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:border-white/25 hover:text-white">
                    <span class=move || if copied.get() { "inline-flex items-center gap-1.5" } else { "hidden" }>{icon(IconKind::Check, 11, "", "2")} "copied"</span>
                    <span class=move || if copied.get() { "hidden" } else { "inline-flex items-center gap-1.5" }>{icon(IconKind::Copy, 11, "", "2")} "copy"</span>
                </button>
            </div>
            <div class="p-6 font-mono text-[13px] leading-7 space-y-3 overflow-x-auto">
                <div class="flex items-start gap-3">
                    <span class="text-[#2496ED]">"$"</span>
                    <div class="flex-1 min-w-max"><span class="text-zinc-100">"curl -fsSL "</span><span class="text-[#00E5FF]">"https://dokuru.rifuki.dev/install"</span><span class="text-zinc-100">" | bash"</span></div>
                </div>
                <div class="mt-4 pt-4 border-t border-white/5 text-[12px] space-y-2 text-zinc-400">
                    <div class="text-emerald-400">"✓ Agent installed to /usr/local/bin/dokuru"</div>
                    <div class="text-emerald-400">"✓ Cloudflare Tunnel started"</div>
                    <div class="text-emerald-400">"✓ Service enabled and running"</div>
                    <div class="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                        <div class="text-zinc-500 text-[11px]">"→ Next steps:"</div>
                        <div class="pl-3">
                            <div class="text-zinc-300">"Dashboard URL: " <span class="text-[#00E5FF]">"https://xxx.trycloudflare.com"</span></div>
                            <div class="text-zinc-300">"Token: " <span class="text-amber-300">"dok_cbb8becb44ca7ace..."</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    }
}

// PLACEHOLDER_HOSTED_PANEL

#[must_use]
pub(crate) fn cloud_dashboard_panel() -> impl IntoView {
    view! {
        <>
            <div class="flex items-center px-4 py-3 border-b border-white/10 bg-[#0d0d0f]">
                <div class="flex gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/></div>
                <span class="font-mono text-[11px] text-zinc-500 ml-3">"app.dokuru.rifuki.dev"</span>
            </div>
            <div class="p-4 md:p-5 space-y-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h3 class="text-lg font-bold text-white">"Add Docker Agent"</h3>
                        <p class="mt-1 max-w-2xl text-xs leading-5 text-zinc-400 md:text-sm">"Pick a connection mode, then paste the URL and token from the install output."</p>
                    </div>
                    <span class="hidden rounded-full border border-[#2496ED]/30 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#2496ED] sm:inline-flex">"hosted"</span>
                </div>

                <div class="space-y-2">
                    <div class="text-[11px] font-mono uppercase tracking-[0.18em] text-zinc-500">"connection mode"</div>
                    <div class="grid gap-2 sm:grid-cols-3">
                        {connection_mode_card(IconKind::Cloud, "Cloudflare Tunnel", "Instant HTTPS tunnel", true)}
                        {connection_mode_card(IconKind::Link2, "Relay Mode", "No inbound port", false)}
                        {connection_mode_card(IconKind::Globe, "Direct HTTP", "Own reverse proxy", false)}
                    </div>
                </div>

                <div class="grid gap-3 lg:grid-cols-[0.9fr_1.3fr_1fr_auto] lg:items-end">
                    {form_field("Agent Name", "Production Server", "text-zinc-500")}
                    {form_field("Agent URL", "https://xxx.trycloudflare.com", "text-[#00E5FF] font-mono")}
                    {form_field("Agent Token", "dok_************", "text-amber-300 font-mono")}
                    <button class="h-[38px] cursor-pointer rounded-lg bg-[#2496ED] px-4 text-sm font-semibold text-white shadow-[0_0_24px_rgba(36,150,237,0.18)] transition-colors hover:bg-[#2496ED]/90 lg:whitespace-nowrap">"Add Agent"</button>
                </div>

                <div class="flex flex-col gap-2 border-t border-white/10 pt-3 text-[11px] leading-5 text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <span class="font-mono text-[#2496ED]">">_"</span>
                        " Need to prepare the host first? "
                        <span class="font-medium text-[#2496ED]">"Open setup guide"</span>
                    </div>
                    <div class="font-mono uppercase tracking-[0.18em] text-[#2496ED]">"cloudflare selected"</div>
                </div>
            </div>
        </>
    }
}

fn connection_mode_card(
    icon_kind: IconKind,
    title: &'static str,
    body: &'static str,
    active: bool,
) -> impl IntoView {
    let card_class = if active {
        "flex min-w-0 items-center gap-2.5 rounded-xl border border-[#2496ED]/80 bg-[#2496ED]/10 px-3 py-2.5 text-left shadow-[0_0_20px_rgba(36,150,237,0.12)]"
    } else {
        "flex min-w-0 items-center gap-2.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-left"
    };
    let icon_class = if active {
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#2496ED] text-white"
    } else {
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[#2496ED]"
    };
    let title_class = if active {
        "block truncate text-[13px] font-semibold text-zinc-100"
    } else {
        "block truncate text-[13px] font-semibold text-zinc-300"
    };

    view! {
        <div class=card_class>
            <span class=icon_class>{icon(icon_kind, 16, "", "2")}</span>
            <span class="min-w-0 flex-1">
                <span class=title_class>{title}</span>
                <span class="mt-0.5 block truncate text-[11px] leading-4 text-zinc-500">{body}</span>
            </span>
        </div>
    }
}

fn form_field(
    label: &'static str,
    value: &'static str,
    value_class: &'static str,
) -> impl IntoView {
    view! {
        <div class="min-w-0">
            <label class="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</label>
            <div class=format!("h-[38px] truncate rounded-lg border border-white/10 bg-[#0d0d0f] px-3 py-2 text-[12px] {}", value_class)>{value}</div>
        </div>
    }
}

// PLACEHOLDER_DIRECT_PANEL

#[must_use]
pub(crate) fn agent_dashboard_panel() -> impl IntoView {
    view! {
        <>
            <div class="flex items-center px-4 py-3 border-b border-white/10 bg-[#0d0d0f]">
                <div class="flex gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/></div>
                <span class="font-mono text-[11px] text-zinc-500 ml-3">"dokuru-agent · local dashboard"</span>
            </div>
            <div class="p-5 md:p-6 font-mono text-[12px] leading-7 space-y-3 overflow-x-auto">
                <div class="text-zinc-500 text-[11px]">"# Direct agent dashboard:"</div>
                <div class="space-y-1.5 pl-2 border-l-2 border-[#2496ED]/30">
                    <div class="text-zinc-300">"Host:  " <span class="text-[#00E5FF]">"http://x.x.x.x:3939"</span></div>
                    <div class="text-zinc-300">"Local: " <span class="text-[#00E5FF]">"http://localhost:3939"</span></div>
                    <div class="text-zinc-300">"Token: " <span class="text-amber-300">"dok_cbb8becb44ca7ace..."</span></div>
                </div>
                <div class="mt-4 pt-4 border-t border-white/5 space-y-2">
                    <div class="flex items-start gap-3">
                        <span class="text-[#2496ED]">"$"</span>
                        <span class="text-zinc-100">"ssh -L 3939:localhost:3939 " <span class="text-[#00E5FF]">"user@docker-host-01"</span></span>
                    </div>
                    <div class="flex items-start gap-3">
                        <span class="text-[#2496ED]">"$"</span>
                        <span class="text-zinc-100">"open " <span class="text-[#00E5FF]">"http://localhost:3939"</span></span>
                    </div>
                </div>
                <div class="mt-4 pt-3 border-t border-white/5">
                    <div class="text-zinc-500 text-[11px] leading-relaxed">
                        "Use the VPS/public or private host URL when reachable."<br/>
                        "Otherwise forward 3939 over SSH. No Dokuru server required."
                    </div>
                </div>
            </div>
        </>
    }
}

// PLACEHOLDER_AUDIT_PREVIEW

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
                        <div class="flex items-baseline gap-1 font-heading"><span class="text-5xl font-black text-[#2496ED] leading-none">"97"</span><span class="text-lg text-zinc-600 font-bold">"/ 100"</span></div>
                        <div class="mt-2 text-xs text-zinc-500 font-mono">"CIS-aligned · 39 rules evaluated"</div>
                    </div>
                    <div class="flex flex-col items-end gap-1.5 text-right">
                        {audit_stats::preview_count("bg-rose-500", "text-rose-400", "1", "failed")}
                        {audit_stats::preview_count("bg-emerald-400", "text-emerald-400", "38", "passed")}
                    </div>
                </div>
                <div class="space-y-3">
                    <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">"security pillars"</div>
                    {AUDIT_SECTIONS.iter().map(|section| {
                        audit_stats::preview_pillar_from_section(section.icon, section.name, section.color, section.passed, section.total, section.bar_color)
                    }).collect_view()}
                </div>
                <div class="flex items-center justify-between border-t border-white/5 pt-4">
                    <div class="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">"run · 2s ago"</div>
                    <div class="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#2496ED]">"apply auto-fixes (8)" <span>"→"</span></div>
                </div>
            </div>
        </>
    }
}
