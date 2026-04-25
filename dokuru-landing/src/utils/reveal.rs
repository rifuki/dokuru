use leptos::{prelude::NodeRef, tachys::html::element::ElementType};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::{closure::Closure, JsCast, JsValue};

#[cfg(target_arch = "wasm32")]
pub fn setup_reveals() {
    let Some(window) = web_sys::window() else {
        return;
    };
    let Some(document) = window.document() else {
        return;
    };
    let Ok(nodes) = document.query_selector_all(".reveal") else {
        return;
    };

    for index in 0..nodes.length() {
        let Some(node) = nodes.item(index) else {
            continue;
        };
        let Ok(element) = node.dyn_into::<web_sys::Element>() else {
            continue;
        };

        if is_in_viewport(&window, &element) {
            let _ = element.class_list().add_1("is-visible");
        }
        observe_reveal(element);
    }

    let Ok(Some(body)) = document.query_selector("body") else {
        return;
    };
    let _ = body.class_list().add_1("dokuru-motion-ready");
}

#[cfg(not(target_arch = "wasm32"))]
pub const fn setup_reveals() {}

#[cfg(target_arch = "wasm32")]
pub(crate) fn reveal_ref<E>() -> NodeRef<E>
where
    E: ElementType,
    E::Output: JsCast + Clone + 'static,
{
    let node_ref = NodeRef::new();

    node_ref.on_load(|node: E::Output| {
        observe_reveal(node.unchecked_into::<web_sys::Element>());
    });

    node_ref
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn reveal_ref<E>() -> NodeRef<E>
where
    E: ElementType,
    E::Output: 'static,
{
    NodeRef::new()
}

#[cfg(target_arch = "wasm32")]
fn observe_reveal(element: web_sys::Element) {
    let options = web_sys::IntersectionObserverInit::new();
    options.set_root_margin("-100px 0px -80px 0px");
    options.set_threshold(&JsValue::from_f64(0.12));

    let callback = Closure::wrap(Box::new(
        move |entries: js_sys::Array, observer: web_sys::IntersectionObserver| {
            for entry in entries.iter() {
                let entry = entry.unchecked_into::<web_sys::IntersectionObserverEntry>();
                if !entry.is_intersecting() {
                    continue;
                }

                let target = entry.target();
                let _ = target.class_list().add_1("is-visible");
                observer.unobserve(&target);
            }
        },
    )
        as Box<dyn FnMut(js_sys::Array, web_sys::IntersectionObserver)>);

    let Ok(observer) = web_sys::IntersectionObserver::new_with_options(
        callback.as_ref().unchecked_ref(),
        &options,
    ) else {
        let _ = element.class_list().add_1("is-visible");
        return;
    };

    observer.observe(&element);
    callback.forget();
    std::mem::forget(observer);
}

#[cfg(target_arch = "wasm32")]
fn is_in_viewport(window: &web_sys::Window, element: &web_sys::Element) -> bool {
    let viewport_height = window
        .inner_height()
        .ok()
        .and_then(|height| height.as_f64())
        .unwrap_or(800.0);
    let rect = element.get_bounding_client_rect();

    rect.top() < viewport_height * 0.92 && rect.bottom() > 0.0
}
