use crate::components::atoms::{section_eyebrow::section_eyebrow, IconKind};
use crate::components::molecules::why_card;
use crate::content::WHY_POINTS;
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[must_use]
pub(crate) fn why_dokuru() -> impl IntoView {
    let intro_ref = reveal_ref::<html::Div>();
    let scope_ref = reveal_ref::<html::Div>();
    let points_ref = reveal_ref::<html::Ul>();

    view! {
        <section id="why-dokuru" data-testid="why-dokuru-section" class="relative py-24 md:py-32 border-t border-white/5">
            <div class="max-w-7xl mx-auto px-5 md:px-10">
                <div class="grid lg:grid-cols-12 gap-10">
                    <div node_ref=intro_ref class="reveal lg:col-span-4">
                        {section_eyebrow(IconKind::Shield, "/ why dokuru")}
                        <h2 class="font-heading text-3xl md:text-4xl font-bold tracking-tight text-white leading-[1.1]">"Built for practical"<br class="hidden sm:block"/><span class="sm:hidden">" "</span>"Docker security"<br class="hidden sm:block"/><span class="sm:hidden">" "</span>"workflows."</h2>
                        <p class="mt-4 text-zinc-400 text-base md:text-[17px] leading-relaxed max-w-2xl">"Opinionated on scope, honest about coverage, and designed to live inside the audit-fix-review loop your team actually runs."</p>
                        <div node_ref=scope_ref class="reveal mt-8 p-5 rounded-xl border border-white/10 bg-white/[0.02]" style="--motion-delay: 300ms; --motion-duration: 500ms">
                            <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-2">"honest scope"</div>
                            <p class="text-zinc-300 text-[14px] leading-relaxed">"Dokuru is not a full CIS compliance platform, container orchestrator, or infrastructure monitor. It is a Docker security audit tool with a clear focus."</p>
                        </div>
                    </div>
                    <div class="lg:col-span-8">
                        <ul node_ref=points_ref class="reveal grid sm:grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden" data-reveal="fade" style="--motion-duration: 300ms">
                            {WHY_POINTS.iter().enumerate().map(|(i, point)| why_card::why_card(point, i)).collect_view()}
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    }
}
