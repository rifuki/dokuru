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
    mark_app_ready();
    utils::page_motion::setup_page_motion();
}

fn mark_app_ready() {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Some(document) = window.document() else {
        return;
    };
    let Ok(Some(body)) = document.query_selector("body") else {
        return;
    };

    _ = body.class_list().add_1("dokuru-app-ready");
}
