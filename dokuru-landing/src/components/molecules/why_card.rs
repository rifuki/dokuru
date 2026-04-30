use crate::components::atoms::icon::icon;
use crate::content::WhyPoint;
use leptos::prelude::*;

#[must_use]
pub(crate) fn why_card(point: &'static WhyPoint, index: usize) -> impl IntoView {
    view! {
        <li data-testid=format!("trust-point-{}", index) class="hover-pop bg-[#09090B] p-7 flex flex-col gap-3 transition-colors hover:bg-[#0c0c0f]">
            <div class="hover-rotate">{icon(point.icon, 20, "text-[#2496ED]", "1.75")}</div>
            <h3 class="font-heading text-lg font-bold text-white">{point.title}</h3>
            <p class="text-zinc-400 text-[14px] leading-relaxed">{point.body}</p>
        </li>
    }
}
