#![allow(clippy::must_use_candidate)]

use dokuru_landing::{utils, App};

fn main() {
    _ = console_log::init_with_level(log::Level::Debug);
    console_error_panic_hook::set_once();

    mount_app();
    utils::reveal::setup_reveals();
    utils::page_motion::setup_page_motion();
}

#[cfg(feature = "hydrate")]
fn mount_app() {
    if has_prerendered_app() {
        leptos::mount::hydrate_body(App);
    } else {
        leptos::mount::mount_to_body(App);
    }
}

#[cfg(not(feature = "hydrate"))]
fn mount_app() {
    leptos::mount::mount_to_body(App);
}

#[cfg(feature = "hydrate")]
fn has_prerendered_app() -> bool {
    document()
        .and_then(|document| {
            document
                .query_selector("[data-testid='landing-root']")
                .ok()
                .flatten()
        })
        .is_some()
}

#[cfg(feature = "hydrate")]
fn document() -> Option<web_sys::Document> {
    web_sys::window().and_then(|window| window.document())
}
