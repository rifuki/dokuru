use super::{icon::icon, IconKind};
use leptos::prelude::*;

#[must_use]
pub(crate) fn section_eyebrow(kind: IconKind, label: &'static str) -> impl IntoView {
    view! {
        <div class="mb-5 flex w-full items-center gap-3">
            <div class="inline-flex shrink-0 items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[#2496ED]">
                {icon(kind, 12, "", "2")}
                <span>{label}</span>
            </div>
            <div class="h-px flex-1 bg-gradient-to-r from-[#2496ED]/35 via-white/10 to-transparent" />
        </div>
    }
}

#[must_use]
pub(crate) fn centered_section_eyebrow(kind: IconKind, label: &'static str) -> impl IntoView {
    view! {
        <div class="mb-5 flex w-full max-w-3xl items-center justify-center gap-3">
            <div class="h-px flex-1 bg-gradient-to-l from-[#2496ED]/35 via-white/10 to-transparent" />
            <div class="inline-flex shrink-0 items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[#2496ED]">
                {icon(kind, 12, "", "2")}
                <span>{label}</span>
            </div>
            <div class="h-px flex-1 bg-gradient-to-r from-[#2496ED]/35 via-white/10 to-transparent" />
        </div>
    }
}
