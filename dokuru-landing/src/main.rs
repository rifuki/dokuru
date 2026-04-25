#![allow(clippy::must_use_candidate)]

mod app;
pub mod components;
pub mod content;
pub mod pages;
pub mod utils;

use app::App;

fn main() {
    _ = console_log::init_with_level(log::Level::Debug);
    console_error_panic_hook::set_once();

    leptos::mount::mount_to_body(App);
    utils::page_motion::setup_page_motion();
}
