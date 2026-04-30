use leptos::prelude::*;

#[derive(Clone, Copy)]
pub enum IconKind {
    Menu,
    X,
    ArrowRight,
    Terminal,
    AlertTriangle,
    ShieldCheck,
    Wrench,
    History,
    ServerCog,
    Copy,
    Check,
    Zap,
    Box,
    Gauge,
    Shield,
    Boxes,
    Lock,
    Cpu,
    KeyRound,
    Archive,
    Container,
    Code,
    Github,
    LifeBuoy,
    Clock,
}

const fn icon_markup(kind: IconKind) -> &'static str {
    match kind {
        IconKind::Menu => {
            r#"<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>"#
        }
        IconKind::X => r#"<path d="M18 6 6 18"/><path d="m6 6 12 12"/>"#,
        IconKind::ArrowRight => r#"<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>"#,
        IconKind::Terminal => {
            r#"<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>"#
        }
        IconKind::AlertTriangle => {
            r#"<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>"#
        }
        IconKind::ShieldCheck => {
            r#"<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>"#
        }
        IconKind::Wrench => {
            r#"<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>"#
        }
        IconKind::History => {
            r#"<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><path d="M12 7v5l4 2"/>"#
        }
        IconKind::ServerCog => {
            r#"<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/><circle cx="18" cy="18" r="2.5"/><path d="M18 15v1"/><path d="M18 20v1"/><path d="M15 18h1"/><path d="M20 18h1"/>"#
        }
        IconKind::Copy => {
            r#"<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>"#
        }
        IconKind::Check => r#"<path d="M20 6 9 17l-5-5"/>"#,
        IconKind::Zap => {
            r#"<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>"#
        }
        IconKind::Box => {
            r#"<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>"#
        }
        IconKind::Gauge => r#"<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>"#,
        IconKind::Shield => {
            r#"<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>"#
        }
        IconKind::Boxes => {
            r#"<path d="M2.97 12.92 12 17.5l9.03-4.58"/><path d="M2.97 7.08 12 2.5l9.03 4.58L12 11.66z"/><path d="M12 22.5v-5"/><path d="M2.97 12.92v5L12 22.5l9.03-4.58v-5"/>"#
        }
        IconKind::Lock => {
            r#"<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>"#
        }
        IconKind::Cpu => {
            r#"<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M20 15h2"/><path d="M9 2v2"/><path d="M9 20v2"/><path d="M2 9h2"/><path d="M20 9h2"/>"#
        }
        IconKind::KeyRound => {
            r#"<path d="M2.6 18.4 9 12"/><circle cx="14" cy="8" r="5"/><path d="m7 14 3 3"/><path d="m6 20 4-4"/>"#
        }
        IconKind::Archive => {
            r#"<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>"#
        }
        IconKind::Container => {
            r#"<path d="M22 12.5V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7.5"/><path d="M2 7.5 12 2l10 5.5-10 5.5z"/><path d="M12 13v9"/><path d="m7 10 10-5.5"/>"#
        }
        IconKind::Code => {
            r#"<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>"#
        }
        IconKind::Github => {
            r#"<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>"#
        }
        IconKind::LifeBuoy => {
            r#"<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>"#
        }
        IconKind::Clock => {
            r#"<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>"#
        }
    }
}

#[must_use]
pub(crate) fn icon(
    kind: IconKind,
    size: u16,
    class: &'static str,
    stroke_width: &'static str,
) -> impl IntoView {
    view! {
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width=size
            height=size
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width=stroke_width
            stroke-linecap="round"
            stroke-linejoin="round"
            class=class
            aria-hidden="true"
            inner_html=icon_markup(kind)
        ></svg>
    }
}
