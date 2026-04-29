use crate::components::molecules::FeatureCard;
use crate::content::FEATURES;
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[component]
pub(crate) fn Features() -> impl IntoView {
    let heading_ref = reveal_ref::<html::Div>();

    view! {
        <section id="features" data-testid="features-section" class="relative py-24 md:py-32 border-t border-white/5">
            <div class="max-w-7xl mx-auto px-6 md:px-10">
                <div node_ref=heading_ref class="reveal max-w-3xl mb-14">
                    <div class="font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4">"/ features"</div>
                    <h2 class="font-heading text-4xl md:text-5xl font-extrabold tracking-tighter text-white leading-[1.08]">
                        "A focused toolkit for Docker"
                        <br class="hidden sm:block"/>
                        "security posture."
                    </h2>
                    <p class="mt-5 text-zinc-400 text-lg max-w-2xl">"Dokuru is built around four things and tries to do them well — no generic container management, no vague monitoring."</p>
                </div>

                <div class="grid md:grid-cols-2 gap-6">
                    {FEATURES.iter().enumerate().map(|(i, feature)| {
                        view! { <FeatureCard feature=feature index=i/> }
                    }).collect_view()}
                </div>
            </div>
        </section>
    }
}
