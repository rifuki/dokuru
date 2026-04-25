use leptos::prelude::RwSignal;

#[cfg(target_arch = "wasm32")]
use crate::content::INSTALL_CMD;
#[cfg(target_arch = "wasm32")]
use leptos::prelude::Set;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::{closure::Closure, JsCast};

#[cfg(target_arch = "wasm32")]
pub(crate) fn copy_install_command() {
    if let Some(window) = web_sys::window() {
        let _ = window.navigator().clipboard().write_text(INSTALL_CMD);
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) const fn copy_install_command() {}

#[cfg(target_arch = "wasm32")]
pub(crate) fn reset_copied_after(copied: RwSignal<bool>) {
    if let Some(window) = web_sys::window() {
        let closure = Closure::wrap(Box::new(move || copied.set(false)) as Box<dyn FnMut()>);
        let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(
            closure.as_ref().unchecked_ref(),
            1800,
        );
        closure.forget();
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) const fn reset_copied_after(_copied: RwSignal<bool>) {}
