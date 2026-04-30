use crate::components::organisms::{
    coverage, features, final_cta, footer, header, hero, how_it_works, problem, why_dokuru,
};
use leptos::prelude::*;

#[must_use]
pub(crate) fn landing() -> impl IntoView {
    view! {
        <div data-testid="landing-root" class="min-h-screen bg-[#050505] text-white selection:bg-[#2496ED]/30">
            {header::header()}
            <main>
                {hero::hero()}
                {problem::problem()}
                {features::features()}
                {how_it_works::how_it_works()}
                {coverage::coverage()}
                {why_dokuru::why_dokuru()}
                {final_cta::final_cta()}
            </main>
            {footer::footer()}
        </div>
    }
}
