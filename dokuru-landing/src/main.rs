#![allow(clippy::must_use_candidate)]

use dokuru_landing::{utils, App};

fn main() {
    _ = console_log::init_with_level(log::Level::Debug);
    console_error_panic_hook::set_once();

    leptos::mount::hydrate_body(App);
    utils::page_motion::setup_page_motion();
}
