// CIS Docker Benchmark checks organized by section
//
// Architecture: Strategy Pattern + Registry
// - Each section implements CheckSection trait
// - Registry dispatches rules to appropriate section
// - Sections are self-contained (checks + fixes + metadata)

mod section_trait;
pub mod section2;
// TODO: Implement section3, section5

pub use section_trait::CheckSection;
use std::sync::Arc;

/// Registry of all CIS sections
pub struct SectionRegistry {
    sections: Vec<Arc<dyn CheckSection>>,
}

impl SectionRegistry {
    pub fn new() -> Self {
        Self {
            sections: vec![
                Arc::new(section2::Section2),
                // TODO: Add Section3, Section5
            ],
        }
    }

    /// Find section that handles the given rule ID
    pub fn find_section(&self, rule_id: &str) -> Option<&Arc<dyn CheckSection>> {
        self.sections.iter().find(|s| s.handles(rule_id))
    }
}

impl Default for SectionRegistry {
    fn default() -> Self {
        Self::new()
    }
}
