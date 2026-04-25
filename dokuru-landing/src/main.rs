#![allow(clippy::must_use_candidate)]

use dokuru_landing::{utils, App};

fn main() {
    _ = console_log::init_with_level(log::Level::Debug);
    console_error_panic_hook::set_once();

    enable_reveal_motion();
    mount_app();
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

fn enable_reveal_motion() {
    let Some(document) = document() else {
        return;
    };
    let Ok(Some(body)) = document.query_selector("body") else {
        return;
    };

    _ = body.class_list().add_1("dokuru-motion-ready");
}

fn document() -> Option<web_sys::Document> {
    web_sys::window().and_then(|window| window.document())
}
