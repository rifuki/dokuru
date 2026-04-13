pub struct App {
    pub should_quit: bool,
    pub active_tab: usize,
    pub tabs: Vec<&'static str>,
}

impl App {
    pub fn new() -> Self {
        Self {
            should_quit: false,
            active_tab: 0,
            tabs: vec!["Dashboard", "Audit", "Fix", "Report"],
        }
    }

    pub fn quit(&mut self) {
        self.should_quit = true;
    }

    pub fn next_tab(&mut self) {
        self.active_tab = (self.active_tab + 1) % self.tabs.len();
    }

    pub fn prev_tab(&mut self) {
        if self.active_tab > 0 {
            self.active_tab -= 1;
        } else {
            self.active_tab = self.tabs.len() - 1;
        }
    }
    
    pub async fn run_audit(&mut self) {
        // Logic will hook to core
    }

    pub async fn apply_fix(&mut self) {
        // Logic will hook to core
    }
}
