use crate::components::atoms::{icon::icon, IconKind};
use leptos::prelude::*;

#[must_use]
pub(crate) fn audit_count(
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

#[must_use]
pub(crate) fn preview_count(
    color: &'static str,
    text_color: &'static str,
    count: &'static str,
    label: &'static str,
) -> impl IntoView {
    view! {
        <div class="flex items-center gap-2"><span class=format!("w-1.5 h-1.5 rounded-sm {}", color)/><span class="font-mono text-xs text-zinc-300"><span class=format!("{} font-semibold", text_color)>{count}</span> " " {label}</span></div>
    }
}

#[must_use]
pub(crate) fn preview_pillar_from_section(
    icon_kind: IconKind,
    label: &'static str,
    color: &'static str,
    passed: usize,
    total: usize,
    bar: &'static str,
) -> impl IntoView {
    let count = format!("{passed}/{total}");
    let width = format!("width: {}%", passed * 100 / total);

    view! {
        <div class="space-y-2">
            <div class="flex items-center justify-between">
                <span class=format!("inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded border {} bg-white/[0.02]", color)>{icon(icon_kind, 11, "", "2")}{label}</span>
                <span class="font-mono text-[10px] text-zinc-600">{count}</span>
            </div>
            <div class="h-1 bg-white/5 rounded-full overflow-hidden"><div class=format!("h-full {}", bar) style=width/></div>
        </div>
    }
}
