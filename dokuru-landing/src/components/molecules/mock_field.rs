use leptos::prelude::*;

#[component]
pub(crate) fn MockField(
    label: &'static str,
    value: &'static str,
    value_class: &'static str,
) -> impl IntoView {
    view! {
        <div>
            <label class="block text-sm font-medium text-zinc-300 mb-2">{label}</label>
            <div class=format!("bg-[#0d0d0f] border border-white/10 rounded-lg px-3 py-2.5 {}", value_class)>{value}</div>
        </div>
    }
}
