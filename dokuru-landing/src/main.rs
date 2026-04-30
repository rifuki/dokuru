mod app;
pub mod components;
pub mod content;
pub mod pages;
pub mod utils;

use app::app;

fn main() {
    _ = console_log::init_with_level(log::Level::Debug);
    console_error_panic_hook::set_once();

    leptos::mount::mount_to_body(app);
    utils::page_motion::setup_page_motion();
}
