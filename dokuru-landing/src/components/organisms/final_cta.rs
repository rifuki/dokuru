use crate::components::atoms::{icon::icon, IconKind};
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[must_use]
pub(crate) fn final_cta() -> impl IntoView {
    let card_ref = reveal_ref::<html::Div>();
    let label_ref = reveal_ref::<html::Div>();
    let heading_ref = reveal_ref::<html::H2>();
    let body_ref = reveal_ref::<html::P>();
    let actions_ref = reveal_ref::<html::Div>();
    let preview_ref = reveal_ref::<html::Div>();

    view! {
        <section id="cta" data-testid="final-cta-section" class="relative py-24 md:py-32 border-t border-white/5">
            <div class="max-w-6xl mx-auto px-6 md:px-10">
                <div node_ref=card_ref class="reveal relative rounded-2xl border border-white/10 bg-[#09090B] overflow-hidden">
                    <div class="absolute inset-0 pointer-events-none bg-grid-fine opacity-60"/>
                    <div class="relative p-5 sm:p-10 md:p-16 grid lg:grid-cols-12 gap-10 items-center">
                        <div class="lg:col-span-7">
                            <div node_ref=label_ref class="reveal font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4" style="--motion-duration: 500ms">"/ start auditing"</div>
                            <h2 node_ref=heading_ref class="reveal font-heading text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.06]" style="--motion-delay: 100ms; --motion-duration: 500ms">"Start auditing Docker"<br class="hidden sm:block"/>"security with Dokuru."</h2>
                            <p node_ref=body_ref class="reveal mt-4 text-zinc-400 text-base md:text-[17px] max-w-xl" style="--motion-delay: 200ms; --motion-duration: 500ms">"Connect your Docker hosts, run isolation-focused audits, and apply supported fixes — from one dashboard."</p>
                            <div node_ref=actions_ref class="reveal mt-8 flex flex-wrap items-center gap-3" style="--motion-delay: 300ms; --motion-duration: 500ms">
                                <a href="#register" data-testid="final-cta-primary" class="group inline-flex items-center gap-2 bg-[#2496ED] hover:bg-[#1C7CBA] text-white font-medium px-6 py-3.5 rounded-xl shadow-sm transition-colors active:scale-[0.98]">"Get Started" {icon(IconKind::ArrowRight, 16, "transition-transform group-hover:translate-x-0.5", "2")}</a>
                                <a href="#how-it-works" data-testid="final-cta-secondary" class="inline-flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/25 text-white font-medium px-6 py-3.5 rounded-xl transition-colors active:scale-[0.98]">{icon(IconKind::Terminal, 16, "text-[#2496ED]", "2")}"View Audit Workflow"</a>
                            </div>
                        </div>
                        <div node_ref=preview_ref class="reveal lg:col-span-5" data-reveal="left" style="--motion-delay: 200ms; --motion-duration: 600ms">
                            <div class="rounded-xl border border-white/10 bg-black/60 backdrop-blur-sm overflow-hidden">
                                <div class="flex items-center px-4 py-3 border-b border-white/10 bg-[#0d0d0f]"><div class="flex gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/><span class="w-2.5 h-2.5 rounded-full bg-zinc-700"/></div><span class="font-mono text-[11px] text-zinc-500 ml-3">"quick start"</span></div>
                                <div class="p-5 font-mono text-[13px] leading-7 text-zinc-200">
                                    <div><span class="text-[#2496ED]">"$"</span> " curl -fsSL " <span class="text-[#00E5FF]">"https://dokuru.rifuki.dev/install"</span> " | bash"</div>
                                    <div class="text-zinc-500 text-[11px] mt-2">"# Copy URL + token, add to dashboard"</div>
                                    <div class="text-zinc-500 text-[11px]">"# Run audits from app.dokuru.rifuki.dev" <span class="terminal-cursor"/></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    }
}
