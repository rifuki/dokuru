use crate::components::atoms::{section_eyebrow::section_eyebrow, IconKind};
use crate::components::molecules::feature_card;
use crate::content::FEATURES;
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[must_use]
pub(crate) fn features() -> impl IntoView {
    let heading_ref = reveal_ref::<html::Div>();

    view! {
        <section id="features" data-testid="features-section" class="relative py-24 md:py-32 border-t border-white/5">
            <div class="max-w-7xl mx-auto px-6 md:px-10">
                <div node_ref=heading_ref class="reveal max-w-3xl mb-14">
                    {section_eyebrow(IconKind::ShieldCheck, "/ features")}
                    <h2 class="font-heading text-3xl md:text-4xl font-bold tracking-tight text-white leading-[1.1]">
                        "A focused toolkit for Docker"
                        <br class="hidden sm:block"/>
                        "security posture."
                    </h2>
                    <p class="mt-4 text-zinc-400 text-base md:text-[17px] leading-relaxed max-w-2xl">"Dokuru is built around four things and tries to do them well — no generic container management, no vague monitoring."</p>
                </div>

                <div class="grid md:grid-cols-2 gap-6">
                    {FEATURES.iter().enumerate().map(|(i, feature)| {
                        feature_card::feature_card(feature, i)
                    }).collect_view()}
                </div>
            </div>
        </section>
    }
}
