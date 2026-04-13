use ratatui::{
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Tabs},
    Frame,
};

use crate::app::App;

pub fn ui(f: &mut Frame, app: &mut App) {
    let size = f.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Length(3), Constraint::Min(0)].as_ref())
        .split(size);

    let titles: Vec<Line> = app
        .tabs
        .iter()
        .map(|t| {
            Line::from(vec![Span::styled(
                *t,
                Style::default().fg(Color::Yellow),
            )])
        })
        .collect();
        
    let tabs = Tabs::new(titles)
        .block(Block::default().borders(Borders::ALL).title(" Dokuru CIS Agent "))
        .select(app.active_tab)
        .style(Style::default().fg(Color::Cyan))
        .highlight_style(
            Style::default()
                .add_modifier(Modifier::BOLD)
                .bg(Color::Black),
        );
    f.render_widget(tabs, chunks[0]);

    let inner = match app.active_tab {
        0 => Paragraph::new("Dashboard Content (System Info, Containers, Score)").block(Block::default().title("Dashboard").borders(Borders::ALL)),
        1 => Paragraph::new("Audit Running... [Press 'a' to Audit]").block(Block::default().title("Audit").borders(Borders::ALL)),
        2 => Paragraph::new("Fix Interface... [Press 'Enter' to Apply]").block(Block::default().title("Fix").borders(Borders::ALL)),
        3 => Paragraph::new("Report Summary...").block(Block::default().title("Report").borders(Borders::ALL)),
        _ => unreachable!(),
    };
    
    f.render_widget(inner, chunks[1]);
}
