use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CisRule {
    pub id: String,
    pub title: String,
    pub category: String,
    pub severity: String,
    pub section: String,
    pub description: String,
    pub remediation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CheckResult {
    pub rule: CisRule,
    pub status: String,
    pub message: String,
    #[serde(default)]
    pub affected: Vec<String>,
    #[serde(default = "default_remediation_kind")]
    pub remediation_kind: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub audit_command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub raw_output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub references: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub rationale: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub impact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub remediation_guide: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuditSummary {
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub errors: usize,
    pub score: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScoreBand {
    Healthy,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SecurityPillar {
    Namespace,
    Cgroup,
    Runtime,
    Host,
    Images,
}

impl SecurityPillar {
    #[must_use]
    pub const fn key(&self) -> &'static str {
        match self {
            Self::Namespace => "namespace",
            Self::Cgroup => "cgroup",
            Self::Runtime => "runtime",
            Self::Host => "host",
            Self::Images => "images",
        }
    }

    #[must_use]
    pub const fn label(&self) -> &'static str {
        match self {
            Self::Namespace => "Namespace Isolation",
            Self::Cgroup => "Cgroup Controls",
            Self::Runtime => "Runtime Hardening",
            Self::Host => "Host Configuration",
            Self::Images => "Images & Daemon",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SectionMeta {
    pub key: String,
    pub label: String,
    pub number: String,
    pub order: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GroupSummary {
    pub key: String,
    pub label: String,
    pub number: Option<String>,
    pub total: usize,
    pub passed: usize,
    pub failed: usize,
    pub errors: usize,
    pub percent: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct SeverityFailureSummary {
    pub high: usize,
    pub medium: usize,
    pub low: usize,
    pub unknown: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RemediationEffort {
    Quick,
    Moderate,
    Involved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RemediationAction {
    pub rank: usize,
    pub rule_id: String,
    pub title: String,
    pub severity: String,
    pub section_key: String,
    pub section_label: String,
    pub pillar_key: String,
    pub pillar_label: String,
    pub remediation_kind: String,
    pub effort: RemediationEffort,
    pub risk_score: u16,
    pub affected_count: usize,
    pub command_available: bool,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct RemediationPlan {
    pub total_failed: usize,
    pub auto_fixable: usize,
    pub guided: usize,
    pub manual: usize,
    pub high_impact: usize,
    pub medium_impact: usize,
    pub low_impact: usize,
    pub quick_wins: usize,
    pub actions: Vec<RemediationAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuditViewReport {
    pub summary: AuditSummary,
    pub score_band: ScoreBand,
    pub sections: Vec<GroupSummary>,
    pub pillars: Vec<GroupSummary>,
    pub severity_failures: SeverityFailureSummary,
    pub remediation: RemediationPlan,
    pub sorted_results: Vec<CheckResult>,
}

pub fn build_audit_view_report(results: Vec<CheckResult>) -> AuditViewReport {
    let summary = summarize_results(&results);
    let mut sorted_results = results;
    for result in &mut sorted_results {
        result.rule.section = section_meta(&result.rule.section).key;
    }
    sorted_results.sort_by(compare_results);

    AuditViewReport {
        score_band: score_band(summary.score),
        sections: summarize_sections(&sorted_results),
        pillars: summarize_pillars(&sorted_results),
        severity_failures: summarize_failed_severities(&sorted_results),
        remediation: build_remediation_plan(&sorted_results),
        sorted_results,
        summary,
    }
}

#[must_use]
pub fn summarize_results(results: &[CheckResult]) -> AuditSummary {
    let passed = results
        .iter()
        .filter(|result| is_pass(&result.status))
        .count();
    let failed = results
        .iter()
        .filter(|result| is_fail(&result.status))
        .count();
    let errors = results
        .iter()
        .filter(|result| is_error(&result.status))
        .count();
    let total = passed + failed;

    AuditSummary {
        total,
        passed,
        failed,
        errors,
        score: score_percentage(passed, total),
    }
}

#[must_use]
pub fn section_meta(section: &str) -> SectionMeta {
    match section {
        "Host Configuration" => SectionMeta {
            key: "Host Configuration".to_string(),
            label: "Host".to_string(),
            number: "S1".to_string(),
            order: 1,
        },
        "Docker Daemon Configuration" | "Daemon Configuration" => SectionMeta {
            key: "Docker Daemon Configuration".to_string(),
            label: "Daemon".to_string(),
            number: "S2".to_string(),
            order: 2,
        },
        "Docker Daemon Configuration Files" | "Config File Permissions" => SectionMeta {
            key: "Docker Daemon Configuration Files".to_string(),
            label: "Files".to_string(),
            number: "S3".to_string(),
            order: 3,
        },
        "Container Images and Build Files" | "Container Images" => SectionMeta {
            key: "Container Images and Build Files".to_string(),
            label: "Images".to_string(),
            number: "S4".to_string(),
            order: 4,
        },
        "Container Runtime" => SectionMeta {
            key: "Container Runtime".to_string(),
            label: "Runtime".to_string(),
            number: "S5".to_string(),
            order: 5,
        },
        _ => SectionMeta {
            key: section.to_string(),
            label: section.to_string(),
            number: String::new(),
            order: u8::MAX,
        },
    }
}

#[must_use]
pub fn rule_pillar(rule_id: &str) -> SecurityPillar {
    match rule_id {
        "2.8" | "2.10" | "5.9" | "5.10" | "5.16" | "5.17" | "5.21" | "5.31" => {
            SecurityPillar::Namespace
        }
        "2.11" | "5.11" | "5.12" | "5.19" | "5.25" | "5.29" => SecurityPillar::Cgroup,
        "5.3" | "5.4" | "5.5" | "5.13" | "5.18" | "5.20" | "5.22" | "5.23" | "5.24" | "5.26"
        | "5.32" => SecurityPillar::Runtime,
        _ if rule_id.starts_with("1.") => SecurityPillar::Host,
        _ if rule_id.starts_with("2.")
            || rule_id.starts_with("3.")
            || rule_id.starts_with("4.") =>
        {
            SecurityPillar::Images
        }
        _ => SecurityPillar::Host,
    }
}

#[must_use]
pub const fn score_band(score: u8) -> ScoreBand {
    if score >= 80 {
        ScoreBand::Healthy
    } else if score >= 60 {
        ScoreBand::Warning
    } else {
        ScoreBand::Critical
    }
}

pub fn build_remediation_plan(results: &[CheckResult]) -> RemediationPlan {
    let mut plan = RemediationPlan::default();
    let mut actions: Vec<RemediationAction> = results
        .iter()
        .filter(|result| is_fail(&result.status))
        .map(remediation_action)
        .collect();

    actions.sort_by(compare_remediation_actions);

    for (idx, action) in actions.iter_mut().enumerate() {
        action.rank = idx + 1;

        match action.remediation_kind.as_str() {
            "auto" => plan.auto_fixable += 1,
            "guided" => plan.guided += 1,
            _ => plan.manual += 1,
        }

        match action.severity.as_str() {
            "High" => plan.high_impact += 1,
            "Medium" => plan.medium_impact += 1,
            "Low" => plan.low_impact += 1,
            _ => {}
        }

        if action.effort == RemediationEffort::Quick {
            plan.quick_wins += 1;
        }
    }

    plan.total_failed = actions.len();
    plan.actions = actions;
    plan
}

fn summarize_sections(results: &[CheckResult]) -> Vec<GroupSummary> {
    let mut summaries: Vec<GroupSummary> = Vec::new();

    for result in results {
        let meta = section_meta(&result.rule.section);
        let summary = section_summary_for(&mut summaries, meta);
        apply_status(summary, &result.status);
    }

    finish_group_summaries(&mut summaries);
    summaries.sort_by(section_summary_order);
    summaries
}

fn section_summary_for(summaries: &mut Vec<GroupSummary>, meta: SectionMeta) -> &mut GroupSummary {
    if let Some(index) = summaries.iter().position(|summary| summary.key == meta.key) {
        return &mut summaries[index];
    }

    summaries.push(GroupSummary {
        key: meta.key,
        label: meta.label,
        number: if meta.number.is_empty() {
            None
        } else {
            Some(meta.number)
        },
        total: 0,
        passed: 0,
        failed: 0,
        errors: 0,
        percent: 0,
    });
    summaries.last_mut().expect("just pushed summary")
}

fn summarize_pillars(results: &[CheckResult]) -> Vec<GroupSummary> {
    let pillar_order = [
        SecurityPillar::Namespace,
        SecurityPillar::Cgroup,
        SecurityPillar::Runtime,
        SecurityPillar::Host,
        SecurityPillar::Images,
    ];

    let mut summaries: Vec<GroupSummary> = pillar_order
        .iter()
        .map(|pillar| GroupSummary {
            key: pillar.key().to_string(),
            label: pillar.label().to_string(),
            number: None,
            total: 0,
            passed: 0,
            failed: 0,
            errors: 0,
            percent: 0,
        })
        .collect();

    for result in results {
        let pillar = rule_pillar(&result.rule.id);
        if let Some(summary) = summaries
            .iter_mut()
            .find(|summary| summary.key == pillar.key())
        {
            apply_status(summary, &result.status);
        }
    }

    finish_group_summaries(&mut summaries);
    summaries
}

fn summarize_failed_severities(results: &[CheckResult]) -> SeverityFailureSummary {
    let mut summary = SeverityFailureSummary::default();

    for result in results.iter().filter(|result| is_fail(&result.status)) {
        match result.rule.severity.as_str() {
            "High" => summary.high += 1,
            "Medium" => summary.medium += 1,
            "Low" => summary.low += 1,
            _ => summary.unknown += 1,
        }
        summary.total += 1;
    }

    summary
}

fn remediation_action(result: &CheckResult) -> RemediationAction {
    let section = section_meta(&result.rule.section);
    let pillar = rule_pillar(&result.rule.id);
    let effort = remediation_effort(&result.remediation_kind);

    RemediationAction {
        rank: 0,
        rule_id: result.rule.id.clone(),
        title: result.rule.title.clone(),
        severity: result.rule.severity.clone(),
        section_key: section.key,
        section_label: section.label,
        pillar_key: pillar.key().to_string(),
        pillar_label: pillar.label().to_string(),
        remediation_kind: result.remediation_kind.clone(),
        effort,
        risk_score: remediation_risk_score(result),
        affected_count: result.affected.len(),
        command_available: result.audit_command.is_some(),
        summary: remediation_summary(result),
    }
}

fn remediation_effort(kind: &str) -> RemediationEffort {
    match kind {
        "auto" => RemediationEffort::Quick,
        "guided" => RemediationEffort::Moderate,
        _ => RemediationEffort::Involved,
    }
}

fn remediation_risk_score(result: &CheckResult) -> u16 {
    let severity = match result.rule.severity.as_str() {
        "High" => 90,
        "Medium" => 60,
        "Low" => 30,
        _ => 20,
    };
    let affected = u16::try_from(result.affected.len().min(10)).unwrap_or(10) * 2;
    let effort_bonus = match result.remediation_kind.as_str() {
        "auto" => 8,
        "guided" => 4,
        _ => 0,
    };

    severity + affected + effort_bonus
}

fn remediation_summary(result: &CheckResult) -> String {
    first_meaningful_line(&result.rule.remediation)
        .or_else(|| {
            result
                .remediation_guide
                .as_deref()
                .and_then(first_meaningful_line)
        })
        .unwrap_or("Review the failed rule and apply the documented remediation.")
        .to_string()
}

fn first_meaningful_line(text: &str) -> Option<&str> {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))
}

const fn apply_status(summary: &mut GroupSummary, status: &str) {
    if is_pass(status) {
        summary.passed += 1;
        summary.total += 1;
    } else if is_fail(status) {
        summary.failed += 1;
        summary.total += 1;
    } else if is_error(status) {
        summary.errors += 1;
    }
}

fn finish_group_summaries(summaries: &mut [GroupSummary]) {
    for summary in summaries {
        summary.percent = score_percentage(summary.passed, summary.total);
    }
}

fn section_summary_order(a: &GroupSummary, b: &GroupSummary) -> Ordering {
    a.percent
        .cmp(&b.percent)
        .then_with(|| section_meta(&a.key).order.cmp(&section_meta(&b.key).order))
        .then_with(|| a.key.cmp(&b.key))
}

fn compare_results(a: &CheckResult, b: &CheckResult) -> Ordering {
    status_rank(&a.status)
        .cmp(&status_rank(&b.status))
        .then_with(|| compare_rule_ids(&a.rule.id, &b.rule.id))
}

fn compare_remediation_actions(a: &RemediationAction, b: &RemediationAction) -> Ordering {
    b.risk_score
        .cmp(&a.risk_score)
        .then_with(|| effort_rank(&a.effort).cmp(&effort_rank(&b.effort)))
        .then_with(|| compare_rule_ids(&a.rule_id, &b.rule_id))
}

const fn effort_rank(effort: &RemediationEffort) -> u8 {
    match effort {
        RemediationEffort::Quick => 0,
        RemediationEffort::Moderate => 1,
        RemediationEffort::Involved => 2,
    }
}

fn compare_rule_ids(a: &str, b: &str) -> Ordering {
    let mut a_parts = a.split('.');
    let mut b_parts = b.split('.');

    loop {
        match (a_parts.next(), b_parts.next()) {
            (Some(a_part), Some(b_part)) => match (a_part.parse::<u16>(), b_part.parse::<u16>()) {
                (Ok(a_num), Ok(b_num)) if a_num != b_num => return a_num.cmp(&b_num),
                _ if a_part != b_part => return a_part.cmp(b_part),
                _ => {}
            },
            (Some(_), None) => return Ordering::Greater,
            (None, Some(_)) => return Ordering::Less,
            (None, None) => return Ordering::Equal,
        }
    }
}

const fn status_rank(status: &str) -> u8 {
    if is_fail(status) {
        0
    } else if is_error(status) {
        1
    } else if is_pass(status) {
        2
    } else {
        3
    }
}

const fn is_pass(status: &str) -> bool {
    status.eq_ignore_ascii_case("pass")
}

const fn is_fail(status: &str) -> bool {
    status.eq_ignore_ascii_case("fail")
}

const fn is_error(status: &str) -> bool {
    status.eq_ignore_ascii_case("error")
}

fn score_percentage(passed: usize, total: usize) -> u8 {
    if total == 0 {
        return 0;
    }

    let percent = passed.saturating_mul(100) / total;
    u8::try_from(percent.min(100)).unwrap_or(100)
}

fn default_remediation_kind() -> String {
    "manual".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(id: &str, section: &str, severity: &str, status: &str) -> CheckResult {
        CheckResult {
            rule: CisRule {
                id: id.to_string(),
                title: format!("Rule {id}"),
                category: "Runtime".to_string(),
                severity: severity.to_string(),
                section: section.to_string(),
                description: String::new(),
                remediation: format!("Fix rule {id}"),
            },
            status: status.to_string(),
            message: String::new(),
            affected: Vec::new(),
            remediation_kind: "manual".to_string(),
            audit_command: None,
            raw_output: None,
            references: None,
            rationale: None,
            impact: None,
            tags: None,
            remediation_guide: None,
        }
    }

    #[test]
    fn maps_rule_ids_to_security_pillars() {
        assert_eq!(rule_pillar("2.10"), SecurityPillar::Namespace);
        assert_eq!(rule_pillar("5.11"), SecurityPillar::Cgroup);
        assert_eq!(rule_pillar("5.20"), SecurityPillar::Runtime);
        assert_eq!(rule_pillar("1.1"), SecurityPillar::Host);
        assert_eq!(rule_pillar("4.1"), SecurityPillar::Images);
    }

    #[test]
    fn normalizes_legacy_and_current_section_names() {
        assert_eq!(
            section_meta("Daemon Configuration").key,
            "Docker Daemon Configuration"
        );
        assert_eq!(
            section_meta("Docker Daemon Configuration Files").label,
            "Files"
        );
        assert_eq!(
            section_meta("Container Images and Build Files").number,
            "S4"
        );
    }

    #[test]
    fn builds_report_with_sections_pillars_and_severity_counts() {
        let report = build_audit_view_report(vec![
            result("5.11", "Container Runtime", "Medium", "Fail"),
            result("1.1", "Host Configuration", "High", "Fail"),
            result("2.10", "Docker Daemon Configuration", "Low", "Pass"),
            result("5.3", "Container Runtime", "High", "Error"),
        ]);

        assert_eq!(report.summary.total, 3);
        assert_eq!(report.summary.passed, 1);
        assert_eq!(report.summary.failed, 2);
        assert_eq!(report.summary.errors, 1);
        assert_eq!(report.summary.score, 33);
        assert_eq!(report.score_band, ScoreBand::Critical);
        assert_eq!(report.severity_failures.high, 1);
        assert_eq!(report.severity_failures.medium, 1);
        assert_eq!(report.remediation.total_failed, 2);
        assert_eq!(report.sorted_results[0].rule.id, "1.1");

        let runtime = report
            .sections
            .iter()
            .find(|section| section.key == "Container Runtime")
            .unwrap();
        assert_eq!(runtime.total, 1);
        assert_eq!(runtime.failed, 1);
        assert_eq!(runtime.errors, 1);

        let cgroup = report
            .pillars
            .iter()
            .find(|pillar| pillar.key == "cgroup")
            .unwrap();
        assert_eq!(cgroup.failed, 1);
    }

    #[test]
    fn sorts_rule_ids_numerically_with_failed_results_first() {
        let report = build_audit_view_report(vec![
            result("5.10", "Container Runtime", "Low", "Pass"),
            result("5.2", "Container Runtime", "Low", "Fail"),
            result("5.11", "Container Runtime", "Low", "Fail"),
        ]);

        let ids: Vec<_> = report
            .sorted_results
            .iter()
            .map(|result| result.rule.id.as_str())
            .collect();

        assert_eq!(ids, vec!["5.2", "5.11", "5.10"]);
    }

    #[test]
    fn builds_ranked_remediation_plan() {
        let mut auto_high = result("5.10", "Container Runtime", "High", "Fail");
        auto_high.remediation_kind = "auto".to_string();
        auto_high.affected = vec!["api".to_string(), "db".to_string()];
        auto_high.audit_command = Some("docker inspect api".to_string());

        let plan = build_remediation_plan(&[
            result("4.1", "Container Images and Build Files", "Low", "Fail"),
            auto_high,
            result("5.11", "Container Runtime", "Medium", "Pass"),
        ]);

        assert_eq!(plan.total_failed, 2);
        assert_eq!(plan.auto_fixable, 1);
        assert_eq!(plan.manual, 1);
        assert_eq!(plan.quick_wins, 1);
        assert_eq!(plan.actions[0].rule_id, "5.10");
        assert_eq!(plan.actions[0].effort, RemediationEffort::Quick);
        assert!(plan.actions[0].command_available);
        assert_eq!(plan.actions[0].summary, "Fix rule 5.10");
    }
}
