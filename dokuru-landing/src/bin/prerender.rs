use dokuru_landing::App;
use leptos::prelude::*;
use std::{env, error::Error, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn Error>> {
    let html_path = env::args_os()
        .nth(1)
        .map_or_else(|| PathBuf::from("dist/index.html"), PathBuf::from);

    let document = fs::read_to_string(&html_path)?;
    let app_html = Owner::new().with(|| view! { <App/> }.to_html());
    let prerendered = replace_body(&document, &app_html)?;

    fs::write(html_path, prerendered)?;
    Ok(())
}

fn replace_body(document: &str, app_html: &str) -> Result<String, Box<dyn Error>> {
    let body_open = document
        .find("<body>")
        .ok_or("dist index.html is missing <body>")?;
    let body_start = body_open + "<body>".len();
    let body_end = document
        .rfind("</body>")
        .ok_or("dist index.html is missing </body>")?;

    let mut output = String::with_capacity(document.len() + app_html.len());
    output.push_str(&document[..body_start]);
    output.push('\n');
    output.push_str(app_html);
    output.push('\n');
    output.push_str(&document[body_end..]);

    Ok(output)
}
