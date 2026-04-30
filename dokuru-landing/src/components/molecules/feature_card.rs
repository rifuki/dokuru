use crate::components::atoms::icon::icon;
use crate::content::Feature;
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[must_use]
pub(crate) fn feature_card(feature: &'static Feature, index: usize) -> impl IntoView {
    let card_ref = reveal_ref::<html::Div>();

    view! {
        <div node_ref=card_ref data-testid=format!("feature-card-{}", index) class="reveal hover-lift group relative bg-[#09090B] border border-white/10 rounded-xl p-8 transition-all duration-300 hover:border-[#2496ED]/40 hover:shadow-[0_30px_60px_-20px_rgba(36,150,237,0.25)]" style=format!("--motion-delay: {}ms; --motion-duration: 500ms", index * 100)>
            <span class="absolute top-0 left-0 h-3 w-3 border-t border-l border-[#2496ED]/50"/>
            <span class="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[#2496ED]/50"/>
            <div class="flex items-center justify-between mb-6">
                <div class="hover-rotate w-11 h-11 rounded-lg bg-[#2496ED]/10 border border-[#2496ED]/20 grid place-items-center text-[#2496ED] group-hover:bg-[#2496ED]/15 transition-colors">
                    {icon(feature.icon, 20, "", "1.75")}
                </div>
                <span class="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">{feature.label}</span>
            </div>
            <h3 class="font-heading text-xl md:text-2xl font-bold text-white leading-tight">{feature.title}</h3>
            <p class="mt-3 text-zinc-400 leading-relaxed text-[15px]">{feature.body}</p>
            <ul class="mt-6 flex flex-wrap gap-2">
                {feature.points.iter().map(|point| view! { <li class="font-mono text-[11px] text-zinc-300 bg-white/[0.03] border border-white/10 rounded-full px-3 py-1">{*point}</li> }).collect_view()}
            </ul>
        </div>
    }
}
