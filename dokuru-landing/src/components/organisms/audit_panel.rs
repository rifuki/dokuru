use crate::components::atoms::Icon;
use crate::components::molecules::{AuditCount, RemediationPill, SeverityChip};
use crate::content::AUDIT_SECTIONS;
use leptos::prelude::*;

#[component]
pub(crate) fn AuditPanel() -> impl IntoView {
    view! {
        <div data-testid="hero-audit-panel" class="relative w-full rounded-xl border border-white/10 bg-[#09090B] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
            <div class="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
                <div class="scan-line absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[#2496ED]/10 to-transparent"/>
            </div>

            <div class="flex items-center px-4 py-3 border-b border-white/10 bg-[#121214]">
                <div class="flex gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/>
                </div>
                <span class="font-mono text-[11px] text-zinc-500 ml-3">
                    "dokuru-agent " <span class="text-zinc-700">"~"</span> " " <span class="text-zinc-400">"target:"</span> " " <span class="text-[#2496ED]">"prod-cluster-01"</span>
                </span>
                <span class="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"/>"live"
                </span>
            </div>

            <div class="p-4 flex flex-col gap-4 relative">
                <div class="flex items-end justify-between gap-4 border-b border-white/5 pb-4">
                    <div>
                        <div class="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1">"audit score"</div>
                        <div class="flex items-baseline gap-1 font-heading">
                            <span class="text-4xl font-black text-emerald-400 leading-none" data-testid="audit-score-value">"78"</span>
                            <span class="text-base text-zinc-600 font-bold">"/ 100"</span>
                        </div>
                        <div class="mt-1 text-[10px] text-zinc-500 font-mono">"CIS-aligned · 42 rules evaluated"</div>
                    </div>
                    <div class="flex flex-col items-end gap-1 text-right">
                        <AuditCount color="bg-rose-500" text_color="text-rose-400" count="7" label="failed"/>
                        <AuditCount color="bg-amber-400" text_color="text-amber-400" count="3" label="warnings"/>
                        <AuditCount color="bg-emerald-400" text_color="text-emerald-400" count="32" label="passed"/>
                    </div>
                </div>

                <div class="flex flex-col gap-2">
                    <div class="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-0.5">"security pillars"</div>
                    {AUDIT_SECTIONS.iter().map(|section| {
                        view! {
                            <div class="flex flex-col gap-1.5">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-1.5">
                                        <span class=format!("inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded border {} bg-white/[0.02]", section.color)>
                                            <Icon kind=section.icon size=10/>
                                            {section.name}
                                        </span>
                                        <span class="font-mono text-[9px] text-zinc-600">{format!("{}/{}", section.passed, section.total)}</span>
                                    </div>
                                </div>
                                <div class="h-0.5 bg-white/5 rounded-full overflow-hidden">
                                    <div class=format!("h-full {}", section.bar_color) style=format!("width: {}%", section.passed * 100 / section.total)/>
                                </div>
                                {section.rules.iter().map(|rule| {
                                    view! {
                                        <div class="flex items-center justify-between gap-2 p-1.5 rounded bg-white/[0.02] border border-white/5">
                                            <div class="flex items-center gap-1.5 min-w-0 flex-1">
                                                <SeverityChip kind=rule.sev/>
                                                <div class="min-w-0 flex-1">
                                                    <div class="font-mono text-[10px] text-zinc-200 truncate">{rule.rule}</div>
                                                    <div class="font-mono text-[9px] text-zinc-500 truncate">{rule.detail}</div>
                                                </div>
                                            </div>
                                            <RemediationPill kind=rule.rem/>
                                        </div>
                                    }
                                }).collect_view()}
                            </div>
                        }
                    }).collect_view()}
                </div>

                <div class="flex items-center justify-between border-t border-white/5 pt-3 -mb-1">
                    <div class="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">"run · 2s ago"</div>
                    <div class="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#2496ED]">"apply auto-fixes (9)" <span>"→"</span></div>
                </div>
            </div>
        </div>
    }
}
