// Registry for all CIS Docker Benchmark rules
use super::rule_definition::RuleDefinition;
use super::types::Severity;
use std::collections::HashMap;

mod section2;

pub struct RuleRegistry {
    rules: HashMap<String, RuleDefinition>,
}

impl RuleRegistry {
    pub fn new() -> Self {
        let mut rules = HashMap::new();

        // Register Section 2 rules
        rules.insert("2.10".into(), section2::rule_2_10());
        rules.insert("2.11".into(), section2::rule_2_11());

        Self { rules }
    }

    pub fn get(&self, rule_id: &str) -> Option<&RuleDefinition> {
        self.rules.get(rule_id)
    }

    pub fn all(&self) -> Vec<&RuleDefinition> {
        self.rules.values().collect()
    }

    pub fn by_section(&self, section: u8) -> Vec<&RuleDefinition> {
        self.rules
            .values()
            .filter(|r| r.section == section)
            .collect()
    }

    pub fn by_severity(&self, severity: Severity) -> Vec<&RuleDefinition> {
        self.rules
            .values()
            .filter(|r| r.severity == severity)
            .collect()
    }
}

impl Default for RuleRegistry {
    fn default() -> Self {
        Self::new()
    }
}
