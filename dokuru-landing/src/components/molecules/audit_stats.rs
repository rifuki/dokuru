use crate::components::atoms::{Icon, IconKind};
use leptos::prelude::*;

#[component]
pub(crate) fn AuditCount(
    color: &'static str,
    text_color: &'static str,
    count: &'static str,
    label: &'static str,
) -> impl IntoView {
    view! {
        <div class="flex items-center gap-1.5">
            <span class=format!("w-1 h-1 rounded-sm {}", color)/>
            <span class="font-mono text-[10px] text-zinc-300"><span class=format!("{} font-semibold", text_color)>{count}</span> " " {label}</span>
        </div>
    }
}

#[component]
pub(crate) fn PreviewCount(
    color: &'static str,
    text_color: &'static str,
    count: &'static str,
    label: &'static str,
) -> impl IntoView {
    view! {
        <div class="flex items-center gap-2"><span class=format!("w-1.5 h-1.5 rounded-sm {}", color)/><span class="font-mono text-xs text-zinc-300"><span class=format!("{} font-semibold", text_color)>{count}</span> " " {label}</span></div>
    }
}

#[component]
pub(crate) fn PreviewPillar(
    icon: IconKind,
    label: &'static str,
    color: &'static str,
    count: &'static str,
    bar: &'static str,
    width: &'static str,
) -> impl IntoView {
    view! {
        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <span class=format!("inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded border {} bg-white/[0.02]", color)><Icon kind=icon size=11/>{label}</span>
                <span class="font-mono text-[10px] text-zinc-600">{count}</span>
            </div>
            <div class="h-1 bg-white/5 rounded-full overflow-hidden"><div class=format!("h-full {}", bar) style=format!("width: {}", width)/></div>
        </div>
    }
}
