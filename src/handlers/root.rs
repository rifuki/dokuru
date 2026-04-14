use axum::response::Html;

const ROOT_PAGE: &str = include_str!("root.html");

pub async fn root() -> Html<&'static str> {
    Html(ROOT_PAGE)
}
