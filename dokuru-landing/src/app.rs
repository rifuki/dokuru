use crate::pages::landing;
use leptos::prelude::*;

#[must_use]
pub fn app() -> impl IntoView {
    view! { {landing::landing()} }
}
