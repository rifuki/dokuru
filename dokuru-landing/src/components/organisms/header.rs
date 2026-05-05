use crate::components::atoms::{dokuru_mark::dokuru_mark, icon::icon, IconKind};
use crate::content::{APP_URL, NAV};
use leptos::prelude::*;

#[must_use]
pub(crate) fn header() -> impl IntoView {
    let open = RwSignal::new(false);
    let scrolled = RwSignal::new(false);
    let hidden = RwSignal::new(false);
    let initial_load = RwSignal::new(true);

    setup_scroll_handler(open, scrolled, hidden, initial_load);

    view! {
        <header
            data-testid="site-header"
            class=move || {
                let mut classes = vec!["fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out"];

                if initial_load.get() {
                    classes.push("animate-enter-down");
                }

                if hidden.get() {
                    classes.push("-translate-y-full opacity-0 pointer-events-none");
                } else {
                    classes.push("translate-y-0 opacity-100 pointer-events-auto");
                }

                if scrolled.get() {
                    classes.push("bg-[#030507]/82 backdrop-blur-xl border-b border-white/10 shadow-sm");
                } else {
                    classes.push("bg-transparent border-b border-transparent");
                }

                classes.join(" ")
            }
        >
            <div class="max-w-7xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
                <a href="#top" data-testid="header-logo" class="flex items-center gap-2.5 group transition-opacity hover:opacity-90">
                    {dokuru_mark("h-7 w-7")}
                    <span class="font-heading font-black text-white text-lg tracking-tight">"dokuru"</span>
                    <span class="hidden sm:inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 border border-white/10 rounded px-1.5 py-0.5 ml-1">"v0.1.0"</span>
                </a>

                <nav class="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
                    {NAV.iter().enumerate().map(|(i, item)| {
                        view! {
                            <a href=item.href data-testid=item.test_id class="animate-enter-nav text-sm text-zinc-400 hover:text-white transition-colors hover:-translate-y-0.5" style=format!("--motion-delay: {}ms", 100 + i * 100)>
                                {item.label}
                            </a>
                        }
                    }).collect_view()}
                </nav>

                <div class="flex items-center gap-3">
                    <a href=APP_URL target="_blank" rel="noopener noreferrer" data-testid="header-cta-enter-app" class="animate-pop-in inline-flex items-center gap-2 bg-[#2496ED] hover:bg-[#1C7CBA] text-white text-sm font-medium px-4 py-2 rounded-xl shadow-sm transition-colors active:scale-[0.98]" style="--motion-delay: 500ms">
                        "Open App"
                    </a>
                    <button
                        data-testid="header-mobile-toggle"
                        on:click=move |_| open.update(|value| *value = !*value)
                        class="cursor-pointer text-zinc-400 hover:text-white md:hidden"
                        aria-label="Toggle menu"
                    >
                        <span class=move || if open.get() { "hidden" } else { "block" }>{icon(IconKind::Menu, 20, "", "2")}</span>
                        <span class=move || if open.get() { "block" } else { "hidden" }>{icon(IconKind::X, 20, "", "2")}</span>
                    </button>
                </div>
            </div>

            <div data-testid="mobile-nav" class=move || if open.get() { "animate-menu-open md:hidden border-t border-white/10 bg-[#050505]/95 backdrop-blur-xl overflow-hidden" } else { "hidden" }>
                <div class="px-6 py-4 flex flex-col gap-4">
                    {NAV.iter().enumerate().map(|(i, item)| {
                        view! {
                            <a href=item.href on:click=move |_| open.set(false) class="animate-enter-left text-sm text-zinc-300 hover:text-white" style=format!("--motion-delay: {}ms", i * 100) data-testid=format!("mobile-{}", item.test_id)>
                                {item.label}
                            </a>
                        }
                    }).collect_view()}
                </div>
            </div>
        </header>
    }
}

#[cfg(target_arch = "wasm32")]
fn setup_scroll_handler(
    open: RwSignal<bool>,
    scrolled: RwSignal<bool>,
    hidden: RwSignal<bool>,
    initial_load: RwSignal<bool>,
) {
    use wasm_bindgen::{closure::Closure, JsCast};

    if let Some(window) = web_sys::window() {
        let initial_y = window.scroll_y().unwrap_or_default();
        let initial_scrolled = initial_y > 8.0;
        scrolled.set(initial_scrolled);

        let last_y = std::rc::Rc::new(std::cell::Cell::new(initial_y));
        let listener_window = window.clone();

        let on_scroll = Closure::wrap(Box::new(move || {
            let current_y = listener_window.scroll_y().unwrap_or_default();
            let next_scrolled = current_y > 8.0;

            if initial_load.get_untracked() {
                initial_load.set(false);
            }

            if scrolled.get_untracked() != next_scrolled {
                scrolled.set(next_scrolled);
            }

            let last = last_y.get();
            // Hide if scrolling down and past 100px threshold, show if scrolling up.
            if current_y > last && current_y > 100.0 {
                if !hidden.get_untracked() {
                    hidden.set(true);
                    if open.get_untracked() {
                        open.set(false);
                    }
                }
            } else if current_y < last && hidden.get_untracked() {
                hidden.set(false);
            }

            last_y.set(current_y);
        }) as Box<dyn FnMut()>);

        let options = web_sys::AddEventListenerOptions::new();
        options.set_passive(true);

        let _ = window.add_event_listener_with_callback_and_add_event_listener_options(
            "scroll",
            on_scroll.as_ref().unchecked_ref(),
            &options,
        );
        on_scroll.forget();
    }
}

#[cfg(not(target_arch = "wasm32"))]
const fn setup_scroll_handler(
    _: RwSignal<bool>,
    _: RwSignal<bool>,
    _: RwSignal<bool>,
    _: RwSignal<bool>,
) {
}
