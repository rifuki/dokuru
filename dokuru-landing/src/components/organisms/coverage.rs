use crate::components::atoms::{section_eyebrow::section_eyebrow, IconKind};
use crate::components::molecules::coverage_card;
use crate::content::COVERAGE_GROUPS;
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[must_use]
pub(crate) fn coverage() -> impl IntoView {
    let heading_ref = reveal_ref::<html::Div>();
    let grid_ref = reveal_ref::<html::Div>();

    view! {
        <section id="coverage" data-testid="coverage-section" class="relative py-24 md:py-32 border-t border-white/5">
            <div class="max-w-7xl mx-auto px-5 md:px-10">
                <div node_ref=heading_ref class="reveal flex items-end justify-between flex-wrap gap-6 mb-12">
                    <div class="max-w-2xl">
                        {section_eyebrow(IconKind::Gauge, "/ coverage")}
                        <h2 class="font-heading text-3xl md:text-4xl font-bold tracking-tight text-white leading-[1.1]">"Focused CIS-aligned coverage"<br class="hidden sm:block"/><span class="sm:hidden">" "</span>"for Docker isolation."</h2>
                        <p class="mt-4 text-zinc-400 text-base md:text-[17px] leading-relaxed max-w-2xl">"Dokuru implements a selected subset of CIS Docker Benchmark v1.8.0 controls across sections 1–5 — with the strongest focus on controls that directly affect container isolation."</p>
                    </div>
                    <span class="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 border border-white/10 rounded px-3 py-1.5 bg-white/[0.02]">"CIS Docker Benchmark v1.8.0 · aligned"</span>
                </div>
                <div node_ref=grid_ref class="reveal grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden" data-reveal="fade" style="--motion-duration: 300ms">
                    {COVERAGE_GROUPS.iter().enumerate().map(|(i, group)| coverage_card::coverage_card(group, i)).collect_view()}
                </div>
            </div>
        </section>
    }
}
