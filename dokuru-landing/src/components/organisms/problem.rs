use crate::components::atoms::{Icon, IconKind};
use crate::content::PAINS;
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[component]
pub(crate) fn Problem() -> impl IntoView {
    let intro_ref = reveal_ref::<html::Div>();

    view! {
        <section id="problem" data-testid="problem-section" class="relative py-24 md:py-32 border-t border-white/5">
            <div class="max-w-7xl mx-auto px-6 md:px-10">
                <div class="grid lg:grid-cols-12 gap-10">
                    <div node_ref=intro_ref class="reveal lg:col-span-5">
                        <div class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-5">
                            <Icon kind=IconKind::AlertTriangle size=12/>
                            <span>"/ the problem"</span>
                        </div>
                        <h2 class="font-heading text-4xl md:text-5xl font-black tracking-tighter leading-[1.05] text-white">
                            "Docker misconfigurations"
                            <br class="hidden sm:block"/>
                            "are " <span class="text-rose-400">"easy to miss"</span> " —"
                            <br class="hidden sm:block"/>
                            "and expensive to find"
                            <br class="hidden sm:block"/>
                            "the hard way."
                        </h2>
                        <p class="mt-6 text-zinc-400 leading-relaxed max-w-md">
                            "Container isolation isn't a single switch. It's a stack of namespaces, cgroup constraints, and runtime flags that have to agree with each other on every host."
                        </p>
                    </div>

                    <div class="lg:col-span-7 lg:pl-6">
                        <ul class="divide-y divide-white/5 border-y border-white/5">
                            {PAINS.iter().enumerate().map(|(i, pain)| {
                                let item_ref = reveal_ref::<html::Li>();

                                view! {
                                    <li node_ref=item_ref data-testid=format!("problem-item-{}", pain.num) class="reveal hover-nudge py-6 md:py-7 grid grid-cols-[auto_1fr] gap-5 md:gap-8 group" data-reveal="left" style=format!("--motion-delay: {}ms; --motion-duration: 500ms", i * 100)>
                                        <span class="font-mono text-xs text-zinc-600 group-hover:text-[#2496ED] transition-colors pt-1">{pain.num}</span>
                                        <div>
                                            <h3 class="font-heading text-lg md:text-xl font-bold text-white">{pain.title}</h3>
                                            <p class="mt-2 text-zinc-400 leading-relaxed text-[15px]">{pain.body}</p>
                                        </div>
                                    </li>
                                }
                            }).collect_view()}
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    }
}
