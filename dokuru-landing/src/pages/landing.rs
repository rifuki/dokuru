use crate::components::organisms::{
    Coverage, Features, FinalCta, Footer, Header, Hero, HowItWorks, Problem, WhyDokuru,
};
use leptos::prelude::*;

#[component]
pub(crate) fn Landing() -> impl IntoView {
    view! {
        <div data-testid="landing-root" class="min-h-screen bg-[#050505] text-white selection:bg-[#2496ED]/30">
            <Header/>
            <main>
                <Hero/>
                <Problem/>
                <Features/>
                <HowItWorks/>
                <Coverage/>
                <WhyDokuru/>
                <FinalCta/>
            </main>
            <Footer/>
        </div>
    }
}
