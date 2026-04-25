use leptos::prelude::*;

#[component]
pub(crate) fn SupportItem(#[prop(default = 0)] delay_ms: u16, children: Children) -> impl IntoView {
    view! {
        <li class="animate-enter-left flex items-start gap-3" style=format!("--motion-delay: {delay_ms}ms")>
            <span class="mt-1.5 h-1.5 w-1.5 rounded-sm bg-[#2496ED] shrink-0"/>
            <span class="text-zinc-300 text-[15px] leading-relaxed">{children()}</span>
        </li>
    }
}
