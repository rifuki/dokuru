#[cfg(target_arch = "wasm32")]
use wasm_bindgen::{closure::Closure, JsCast, JsValue};

#[cfg(target_arch = "wasm32")]
pub(crate) fn setup_page_motion() {
    schedule_hash_scroll();
    setup_active_hash_on_scroll();
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) const fn setup_page_motion() {}

#[cfg(target_arch = "wasm32")]
fn schedule_hash_scroll() {
    set_timeout(scroll_to_current_hash, 60);
}

#[cfg(target_arch = "wasm32")]
fn scroll_to_current_hash() {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Ok(hash) = window.location().hash() else {
        return;
    };
    let Some(id) = hash.strip_prefix('#').filter(|id| !id.is_empty()) else {
        return;
    };
    let Some(document) = window.document() else {
        return;
    };
    let Some(element) = document.get_element_by_id(id) else {
        return;
    };

    if id == "footer" {
        scroll_footer_bottom_into_view(&window, &element);
        return;
    }

    element.scroll_into_view();
}

#[cfg(target_arch = "wasm32")]
fn scroll_footer_bottom_into_view(window: &web_sys::Window, element: &web_sys::Element) {
    let viewport_height = window
        .inner_height()
        .ok()
        .and_then(|height| height.as_f64())
        .unwrap_or(800.0);
    let scroll_y = window.scroll_y().unwrap_or_default();
    let rect = element.get_bounding_client_rect();
    let target_y = (scroll_y + rect.bottom() - viewport_height + 96.0).max(0.0);

    window.scroll_to_with_x_and_y(0.0, target_y);
}

#[cfg(target_arch = "wasm32")]
fn setup_active_hash_on_scroll() {
    let Some(window) = web_sys::window() else {
        return;
    };
    let on_scroll = Closure::wrap(Box::new(update_active_hash) as Box<dyn FnMut()>);
    let options = web_sys::AddEventListenerOptions::new();
    options.set_passive(true);

    let _ = window.add_event_listener_with_callback_and_add_event_listener_options(
        "scroll",
        on_scroll.as_ref().unchecked_ref(),
        &options,
    );
    on_scroll.forget();
}

#[cfg(target_arch = "wasm32")]
fn update_active_hash() {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Some(document) = window.document() else {
        return;
    };
    if is_near_page_bottom(&window, &document) {
        replace_hash("footer");
        return;
    }

    let Ok(nodes) = document.query_selector_all("section[id]") else {
        return;
    };

    let viewport_height = window
        .inner_height()
        .ok()
        .and_then(|height| height.as_f64())
        .unwrap_or(800.0);
    let active_line = (viewport_height * 0.25).clamp(120.0, 220.0);
    let mut active_id = None;

    for index in 0..nodes.length() {
        let Some(node) = nodes.item(index) else {
            continue;
        };
        let Ok(element) = node.dyn_into::<web_sys::Element>() else {
            continue;
        };
        let top = element.get_bounding_client_rect().top();
        let id = element.id();

        if top <= active_line {
            active_id = Some(id);
        }
    }

    if let Some(id) = active_id.filter(|id| !id.is_empty()) {
        replace_hash(&id);
    }
}

#[cfg(target_arch = "wasm32")]
fn is_near_page_bottom(window: &web_sys::Window, document: &web_sys::Document) -> bool {
    let viewport_height = window
        .inner_height()
        .ok()
        .and_then(|height| height.as_f64())
        .unwrap_or(0.0);
    let scroll_y = window.scroll_y().unwrap_or_default();
    let Some(root) = document.document_element() else {
        return false;
    };
    let page_height = f64::from(root.scroll_height());

    scroll_y + viewport_height >= page_height - 24.0
}

#[cfg(target_arch = "wasm32")]
fn replace_hash(id: &str) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Ok(current_hash) = window.location().hash() else {
        return;
    };
    let next_hash = format!("#{id}");
    if current_hash == next_hash {
        return;
    }
    let Ok(history) = window.history() else {
        return;
    };

    let _ = history.replace_state_with_url(&JsValue::NULL, "", Some(&next_hash));
}

#[cfg(target_arch = "wasm32")]
fn set_timeout(callback: impl FnMut() + 'static, timeout: i32) {
    let Some(window) = web_sys::window() else {
        return;
    };
    let closure = Closure::wrap(Box::new(callback) as Box<dyn FnMut()>);
    let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(
        closure.as_ref().unchecked_ref(),
        timeout,
    );
    closure.forget();
}
