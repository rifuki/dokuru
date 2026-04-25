#![allow(clippy::must_use_candidate)]

use dokuru_landing::{utils, App};

fn main() {
    _ = console_log::init_with_level(log::Level::Debug);
    console_error_panic_hook::set_once();

    clear_prerendered_app();
    leptos::mount::mount_to_body(App);
    utils::reveal::setup_reveals();
    utils::page_motion::setup_page_motion();
}

fn clear_prerendered_app() {
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        return;
    };
    let Ok(Some(root)) = document.query_selector("[data-testid='landing-root']") else {
        return;
    };

    root.remove();
}
