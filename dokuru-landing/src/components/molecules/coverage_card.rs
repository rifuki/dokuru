use crate::components::atoms::icon::icon;
use crate::content::CoverageGroup;
use leptos::prelude::*;

#[must_use]
pub(crate) fn coverage_card(group: &'static CoverageGroup, index: usize) -> impl IntoView {
    view! {
        <div data-testid=format!("coverage-group-{}", index) class="hover-rise bg-[#09090B] p-8 flex flex-col">
            <div class="flex items-center justify-between mb-6">
                <div class="hover-rotate w-10 h-10 rounded-md bg-[#2496ED]/10 border border-[#2496ED]/20 grid place-items-center text-[#2496ED]">{icon(group.icon, 18, "", "1.75")}</div>
                <span class="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">{group.label}</span>
            </div>
            <h3 class="font-heading text-xl md:text-2xl font-bold text-white">{group.title}</h3>
            <p class="mt-2 text-zinc-400 text-[14px] leading-relaxed">{group.intro}</p>
            <ul class="mt-6 flex flex-col gap-2 border-t border-white/5 pt-5">
                {group.rules.iter().map(|rule| view! { <li class="flex items-start gap-2.5 font-mono text-[13px] text-zinc-300"><span class="mt-[6px] h-1 w-1 rounded-full bg-[#2496ED] shrink-0"/><span>{*rule}</span></li> }).collect_view()}
            </ul>
        </div>
    }
}
