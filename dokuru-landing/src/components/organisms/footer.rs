use crate::components::atoms::{dokuru_mark::dokuru_mark, icon::icon, IconKind};
use crate::content::FOOTER_COLUMNS;
use crate::utils::reveal::reveal_ref;
use leptos::{html, prelude::*};

#[must_use]
pub(crate) fn footer() -> impl IntoView {
    let brand_ref = reveal_ref::<html::Div>();

    view! {
        <footer data-testid="site-footer" class="relative border-t border-white/10 pt-20 pb-10">
            <div class="max-w-7xl mx-auto px-6 md:px-10">
                <div class="grid lg:grid-cols-12 gap-10">
                    <div node_ref=brand_ref class="reveal lg:col-span-4">
                        <div class="flex items-center gap-2.5">{dokuru_mark("h-7 w-7")}<span class="font-heading font-black text-white text-lg tracking-tight">"dokuru"</span></div>
                        <p class="mt-4 text-zinc-400 text-[14px] leading-relaxed max-w-sm">"Agent-based Docker security auditing. CIS-aligned checks focused on namespace isolation, cgroup controls, and runtime hardening."</p>
                        <div class="mt-6 flex items-center gap-3">
                            <a href="https://github.com/rifuki/dokuru" target="_blank" rel="noopener noreferrer" data-testid="footer-social-github" class="w-9 h-9 rounded-md border border-white/10 hover:border-white/30 grid place-items-center text-zinc-400 hover:text-white transition-all hover:scale-110 active:scale-90" aria-label="GitHub">{icon(IconKind::Github, 16, "", "2")}</a>
                        </div>
                    </div>
                    <div class="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-8">
                        {FOOTER_COLUMNS.iter().enumerate().map(|(i, col)| view! {
                            {
                                let column_ref = reveal_ref::<html::Div>();

                                view! {
                                    <div node_ref=column_ref class="reveal" style=format!("--motion-delay: {}ms", i * 80)>
                                <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-4">{col.title}</div>
                                <ul class="flex flex-col gap-3">
                                    {col.links.iter().map(|link| {
                                        let external = link.href.starts_with("http");
                                        let target = if external { "_blank" } else { "_self" };
                                        let rel = if external { "noopener noreferrer" } else { "" };

                                        view! { <li><a href=link.href target=target rel=rel data-testid=link.test_id class="text-[14px] text-zinc-300 hover:text-white transition-all inline-block hover:translate-x-1">{link.label}</a></li> }
                                    }).collect_view()}
                                </ul>
                            </div>
                                }
                            }
                        }).collect_view()}
                    </div>
                </div>
                <div id="footer" class="mt-16 pt-6 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div class="font-mono text-[11px] text-zinc-500">"© 2026 Dokuru. All rights reserved."</div>
                    <div class="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">"dokuru / agent · dashboard"</div>
                </div>
            </div>
        </footer>
    }
}
