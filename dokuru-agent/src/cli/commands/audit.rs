use super::super::types::{
    AuditAction, AuditFixAllArgs, AuditFixArgs, AuditHistoryArgs, AuditPreviewArgs,
    AuditRollbackArgs, AuditRunArgs,
};
use crate::audit::{
    CheckResult, CheckStatus, FixHistoryEntry, FixOutcome, FixPreview, FixPreviewTarget,
    FixRequest, FixStatus, FixTarget, RemediationKind, RollbackRequest, RuleRegistry, fix_helpers,
};
use bollard::Docker;
use eyre::{Result, WrapErr};
use serde::Serialize;
use std::collections::HashSet;

pub async fn run_audit(action: &AuditAction) -> Result<()> {
    match action {
        AuditAction::Run(args) => run_audit_report(args).await,
        AuditAction::Preview(args) => run_preview(args).await,
        AuditAction::Fix(args) => run_fix(args).await,
        AuditAction::FixAll(args) => run_fix_all(args).await,
        AuditAction::History(args) => run_history(args).await,
        AuditAction::Rollback(args) => run_rollback(args).await,
    }
}

#[derive(Debug, Clone, Default)]
struct TargetOverrides {
    strategy: Option<String>,
    memory: Option<i64>,
    cpu_shares: Option<i64>,
    pids_limit: Option<i64>,
    user: Option<String>,
}

#[derive(Debug, Serialize)]
struct ResolvedFixPlan {
    rule_id: String,
    request: FixRequest,
    preview: FixPreview,
}

#[derive(Debug, Serialize)]
struct FixApplyReport {
    rule_id: String,
    request: FixRequest,
    outcome: FixOutcome,
    history_id: String,
    verification: CheckResult,
}

#[derive(Debug, Serialize)]
struct FixAllRuleReport {
    rule_id: String,
    title: String,
    affected: Vec<String>,
    request: FixRequest,
    outcome: FixOutcome,
    history_id: String,
    verification: CheckResult,
}

#[derive(Debug, Serialize)]
struct FixAllReport {
    planned_rules: usize,
    applied_rules: usize,
    blocked_rules: usize,
    final_score: Option<u8>,
    results: Vec<FixAllRuleReport>,
}

#[derive(Debug, Serialize)]
struct FixAllDryRunReport {
    planned_rules: usize,
    rules: Vec<FixAllDryRunRule>,
}

#[derive(Debug, Serialize)]
struct FixAllDryRunRule {
    rule_id: String,
    title: String,
    affected: Vec<String>,
    request: FixRequest,
    preview: FixPreview,
}

async fn run_audit_report(args: &AuditRunArgs) -> Result<()> {
    let docker = connect_docker()?;
    let registry = RuleRegistry::new();
    let report = registry.run_audit(&docker).await?;

    if args.json {
        return print_json(&report);
    }

    println!("Audit score: {}%", report.summary.score);
    println!(
        "Passed: {}  Failed: {}  Total: {}  Containers: {}",
        report.summary.passed, report.summary.failed, report.summary.total, report.total_containers
    );

    let failed: Vec<&CheckResult> = report
        .results
        .iter()
        .filter(|result| result.status == CheckStatus::Fail)
        .collect();
    if failed.is_empty() {
        println!("No failed rules.");
        return Ok(());
    }

    println!("\nFailed rules:");
    for result in failed {
        println!(
            "  {}  {:?}  {} ({:?})",
            result.rule.id, result.rule.severity, result.rule.title, result.remediation_kind
        );
    }

    Ok(())
}

async fn run_preview(args: &AuditPreviewArgs) -> Result<()> {
    let docker = connect_docker()?;
    let preview = fix_helpers::preview_fix(&docker, &args.rule_id).await?;

    if args.json {
        return print_json(&preview);
    }

    print_preview(&preview);
    Ok(())
}

async fn run_fix(args: &AuditFixArgs) -> Result<()> {
    let docker = connect_docker()?;
    let plan = build_fix_plan(
        &docker,
        &args.rule_id,
        &args.targets,
        &TargetOverrides::from(args),
    )
    .await?;

    if args.dry_run || !args.yes {
        if args.json {
            return print_json(&plan);
        }
        print_fix_plan(&plan);
        if !args.dry_run {
            println!("\nPlan only. Re-run with --yes to apply.");
        }
        return Ok(());
    }

    let report = apply_single_fix(&docker, plan.request).await?;
    if args.json {
        return print_json(&report);
    }

    print_apply_report(&report);
    Ok(())
}

async fn run_fix_all(args: &AuditFixAllArgs) -> Result<()> {
    let docker = connect_docker()?;
    let registry = RuleRegistry::new();
    let report = registry.run_audit(&docker).await?;
    let candidates = failed_auto_rules(&report.results, &args.rules, &args.exclude_rules);

    if args.dry_run || !args.yes {
        let dry_run = build_fix_all_dry_run(&docker, candidates).await?;
        if args.json {
            return print_json(&dry_run);
        }
        print_fix_all_dry_run(&dry_run);
        if !args.dry_run {
            println!("\nPlan only. Re-run with --yes to apply.");
        }
        return Ok(());
    }

    let mut results = Vec::new();
    for result in candidates {
        if !args.json {
            println!("Applying {}: {}", result.rule.id, result.rule.title);
        }
        let plan =
            build_fix_plan(&docker, &result.rule.id, &[], &TargetOverrides::default()).await?;
        let applied = apply_single_fix(&docker, plan.request).await?;
        if !args.json {
            print_apply_report(&applied);
        }
        results.push(FixAllRuleReport {
            rule_id: result.rule.id.clone(),
            title: result.rule.title.clone(),
            affected: result.affected.clone(),
            request: applied.request,
            outcome: applied.outcome,
            history_id: applied.history_id,
            verification: applied.verification,
        });
    }

    let final_score = registry
        .run_audit(&docker)
        .await
        .ok()
        .map(|report| report.summary.score);
    let applied_rules = results
        .iter()
        .filter(|result| result.outcome.status == FixStatus::Applied)
        .count();
    let blocked_rules = results
        .iter()
        .filter(|result| result.outcome.status == FixStatus::Blocked)
        .count();
    let report = FixAllReport {
        planned_rules: results.len(),
        applied_rules,
        blocked_rules,
        final_score,
        results,
    };

    if args.json {
        return print_json(&report);
    }

    println!(
        "\nFix-all complete: {} applied, {} blocked, {} planned",
        report.applied_rules, report.blocked_rules, report.planned_rules
    );
    if let Some(score) = report.final_score {
        println!("Final audit score: {score}%");
    }
    Ok(())
}

async fn run_history(args: &AuditHistoryArgs) -> Result<()> {
    let history = fix_helpers::list_fix_history().await;
    if args.json {
        return print_json(&history);
    }

    if history.is_empty() {
        println!("No fix history entries.");
        return Ok(());
    }

    for entry in history {
        print_history_entry(&entry);
    }
    Ok(())
}

async fn run_rollback(args: &AuditRollbackArgs) -> Result<()> {
    let docker = connect_docker()?;
    let history = fix_helpers::list_fix_history().await;
    let Some(entry) = history.iter().find(|entry| entry.id == args.history_id) else {
        return Err(eyre::eyre!(
            "fix history entry not found: {}",
            args.history_id
        ));
    };

    if args.dry_run || !args.yes {
        if args.json {
            return print_json(entry);
        }
        print_history_entry(entry);
        if !args.dry_run {
            println!("\nRollback plan only. Re-run with --yes to apply.");
        }
        return Ok(());
    }

    let request = RollbackRequest {
        history_id: args.history_id.clone(),
    };
    let outcome = fix_helpers::rollback_fix(&docker, &request).await?;
    if args.json {
        return print_json(&outcome);
    }

    println!("Rollback {}: {:?}", outcome.rule_id, outcome.status);
    println!("{}", outcome.message);
    Ok(())
}

fn connect_docker() -> Result<Docker> {
    Docker::connect_with_local_defaults().wrap_err("Failed to connect to local Docker daemon")
}

async fn build_fix_plan(
    docker: &Docker,
    rule_id: &str,
    selectors: &[String],
    overrides: &TargetOverrides,
) -> Result<ResolvedFixPlan> {
    if RuleRegistry::new().get(rule_id).is_none() {
        return Err(eyre::eyre!("rule not found: {rule_id}"));
    }

    let preview = fix_helpers::preview_fix(docker, rule_id).await?;
    let selected = select_preview_targets(&preview, selectors)?;
    let targets = selected
        .iter()
        .map(|target| fix_target_from_preview(rule_id, target, overrides))
        .collect();
    let request = FixRequest {
        rule_id: rule_id.to_string(),
        targets,
    };

    Ok(ResolvedFixPlan {
        rule_id: rule_id.to_string(),
        request,
        preview,
    })
}

async fn apply_single_fix(docker: &Docker, request: FixRequest) -> Result<FixApplyReport> {
    let registry = RuleRegistry::new();
    let rollback_plan = fix_helpers::rollback_plan_for_request(docker, &request)
        .await
        .unwrap_or_default();
    let outcome = Box::pin(registry.fix_request(&request, docker)).await?;
    let entry = fix_helpers::record_fix_history(
        request.clone(),
        outcome.clone(),
        rollback_plan,
        Vec::new(),
    )
    .await;
    let verification = registry.check_rule(&request.rule_id, docker).await?;

    Ok(FixApplyReport {
        rule_id: request.rule_id.clone(),
        request,
        outcome,
        history_id: entry.id,
        verification,
    })
}

async fn build_fix_all_dry_run(
    docker: &Docker,
    candidates: Vec<&CheckResult>,
) -> Result<FixAllDryRunReport> {
    let mut rules = Vec::new();
    for result in candidates {
        let plan =
            build_fix_plan(docker, &result.rule.id, &[], &TargetOverrides::default()).await?;
        rules.push(FixAllDryRunRule {
            rule_id: result.rule.id.clone(),
            title: result.rule.title.clone(),
            affected: result.affected.clone(),
            request: plan.request,
            preview: plan.preview,
        });
    }

    Ok(FixAllDryRunReport {
        planned_rules: rules.len(),
        rules,
    })
}

fn failed_auto_rules<'a>(
    results: &'a [CheckResult],
    includes: &[String],
    excludes: &[String],
) -> Vec<&'a CheckResult> {
    let include_set: HashSet<&str> = includes.iter().map(String::as_str).collect();
    let exclude_set: HashSet<&str> = excludes.iter().map(String::as_str).collect();
    let mut candidates: Vec<&CheckResult> = results
        .iter()
        .filter(|result| result.status == CheckStatus::Fail)
        .filter(|result| result.remediation_kind == RemediationKind::Auto)
        .filter(|result| include_set.is_empty() || include_set.contains(result.rule.id.as_str()))
        .filter(|result| !exclude_set.contains(result.rule.id.as_str()))
        .collect();

    candidates.sort_by_key(|result| rule_sort_key(&result.rule.id));
    candidates
}

fn rule_sort_key(rule_id: &str) -> Vec<u32> {
    rule_id
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(u32::MAX))
        .collect()
}

fn select_preview_targets<'a>(
    preview: &'a FixPreview,
    selectors: &[String],
) -> Result<Vec<&'a FixPreviewTarget>> {
    if selectors.is_empty() {
        return Ok(preview.targets.iter().collect());
    }

    let mut selected = Vec::new();
    let mut seen = HashSet::new();
    let mut missing = Vec::new();
    for selector in selectors {
        let mut matched = false;
        for target in &preview.targets {
            if !target_matches_selector(target, selector) {
                continue;
            }
            matched = true;
            if seen.insert(target.container_id.clone()) {
                selected.push(target);
            }
        }
        if !matched {
            missing.push(selector.clone());
        }
    }

    if !missing.is_empty() {
        return Err(eyre::eyre!(
            "target(s) not found in rule {} preview: {}",
            preview.rule_id,
            missing.join(", ")
        ));
    }

    Ok(selected)
}

fn target_matches_selector(target: &FixPreviewTarget, selector: &str) -> bool {
    let selector = selector.trim().trim_start_matches('/');
    if selector.is_empty() {
        return false;
    }

    let name = target.container_name.trim_start_matches('/');
    target.container_id == selector
        || target.container_id.starts_with(selector)
        || name == selector
        || target.container_name == selector
}

fn fix_target_from_preview(
    rule_id: &str,
    target: &FixPreviewTarget,
    overrides: &TargetOverrides,
) -> FixTarget {
    let suggestion = target.suggestion.as_ref();
    FixTarget {
        container_id: target.container_id.clone(),
        memory: cgroup_memory(
            rule_id,
            suggestion.map(|suggestion| suggestion.memory),
            overrides,
        ),
        cpu_shares: cgroup_cpu_shares(
            rule_id,
            suggestion.map(|suggestion| suggestion.cpu_shares),
            overrides,
        ),
        pids_limit: cgroup_pids_limit(
            rule_id,
            suggestion.map(|suggestion| suggestion.pids_limit),
            overrides,
        ),
        strategy: overrides
            .strategy
            .clone()
            .or_else(|| Some(target.strategy.clone())),
        user: overrides
            .user
            .clone()
            .or_else(|| target.suggested_user.clone()),
    }
}

fn cgroup_memory(
    rule_id: &str,
    suggestion: Option<i64>,
    overrides: &TargetOverrides,
) -> Option<i64> {
    if matches!(rule_id, "5.11" | "5.25" | "cgroup_all") {
        overrides.memory.or(suggestion)
    } else {
        overrides.memory
    }
}

fn cgroup_cpu_shares(
    rule_id: &str,
    suggestion: Option<i64>,
    overrides: &TargetOverrides,
) -> Option<i64> {
    if matches!(rule_id, "5.12" | "5.25" | "cgroup_all") {
        overrides.cpu_shares.or(suggestion)
    } else {
        overrides.cpu_shares
    }
}

fn cgroup_pids_limit(
    rule_id: &str,
    suggestion: Option<i64>,
    overrides: &TargetOverrides,
) -> Option<i64> {
    if matches!(rule_id, "5.29" | "5.25" | "cgroup_all") {
        overrides.pids_limit.or(suggestion)
    } else {
        overrides.pids_limit
    }
}

fn print_preview(preview: &FixPreview) {
    println!("Rule {} preview", preview.rule_id);
    if preview.targets.is_empty() {
        println!("No container targets detected. This may be a host-level fix or no-op.");
    } else {
        for target in &preview.targets {
            println!(
                "  {} ({}) strategy={} image={}",
                target.container_name, target.container_id, target.strategy, target.image
            );
            if let Some(suggestion) = &target.suggestion {
                println!(
                    "    suggested memory={} cpu_shares={} pids_limit={}",
                    suggestion.memory, suggestion.cpu_shares, suggestion.pids_limit
                );
            }
            if let Some(user) = &target.suggested_user {
                println!(
                    "    suggested user={} ({})",
                    user,
                    target
                        .suggested_user_source
                        .as_deref()
                        .unwrap_or("inferred")
                );
            }
        }
    }

    if !preview.steps.is_empty() {
        println!("Steps:");
        for step in &preview.steps {
            println!("  - {step}");
        }
    }
}

fn print_fix_plan(plan: &ResolvedFixPlan) {
    println!("Rule {} fix plan", plan.rule_id);
    println!("Targets: {}", plan.request.targets.len());
    for target in &plan.request.targets {
        println!(
            "  {} strategy={}",
            target.container_id,
            target.strategy.as_deref().unwrap_or("default")
        );
        if target.memory.is_some() || target.cpu_shares.is_some() || target.pids_limit.is_some() {
            println!(
                "    memory={:?} cpu_shares={:?} pids_limit={:?}",
                target.memory, target.cpu_shares, target.pids_limit
            );
        }
        if let Some(user) = target.user.as_deref() {
            println!("    user={user}");
        }
    }
}

fn print_apply_report(report: &FixApplyReport) {
    println!("Rule {}: {:?}", report.rule_id, report.outcome.status);
    println!("{}", report.outcome.message);
    println!("History: {}", report.history_id);
    println!(
        "Verify: {:?} - {}",
        report.verification.status, report.verification.message
    );
}

fn print_fix_all_dry_run(report: &FixAllDryRunReport) {
    if report.rules.is_empty() {
        println!("No failed auto-fixable rules matched.");
        return;
    }

    println!("Fix-all plan: {} rule(s)", report.planned_rules);
    for rule in &report.rules {
        println!(
            "  {} {} ({} target(s))",
            rule.rule_id,
            rule.title,
            rule.request.targets.len()
        );
    }
}

fn print_history_entry(entry: &FixHistoryEntry) {
    println!(
        "{}  rule={}  {:?}",
        entry.id, entry.request.rule_id, entry.outcome.status
    );
    println!("  {}", entry.outcome.message);
    println!("  rollback_supported={}", entry.rollback_supported);
    if let Some(note) = entry.rollback_note.as_deref() {
        println!("  {note}");
    }
}

fn print_json<T: Serialize>(value: &T) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

impl From<&AuditFixArgs> for TargetOverrides {
    fn from(args: &AuditFixArgs) -> Self {
        Self {
            strategy: args.strategy.clone(),
            memory: args.memory,
            cpu_shares: args.cpu_shares,
            pids_limit: args.pids_limit,
            user: args.user.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::{FixPreviewTarget, ResourceSuggestion};

    #[test]
    fn target_selector_matches_id_prefix_and_name() {
        let target = preview_target("abcdef1234567890", "web");

        assert!(target_matches_selector(&target, "abcdef"));
        assert!(target_matches_selector(&target, "web"));
        assert!(target_matches_selector(&target, "/web"));
        assert!(!target_matches_selector(&target, "db"));
    }

    #[test]
    fn selected_targets_reject_missing_selectors() {
        let preview = FixPreview {
            rule_id: "4.1".to_string(),
            targets: vec![preview_target("abcdef1234567890", "web")],
            requires_restart: true,
            requires_elevation: false,
            steps: Vec::new(),
        };

        let error = select_preview_targets(&preview, &["db".to_string()]).unwrap_err();
        assert!(error.to_string().contains("db"));
    }

    #[test]
    fn cgroup_fix_target_uses_rule_specific_suggestions() {
        let target = preview_target_with_suggestion("abcdef1234567890", "web");
        let fix_target = fix_target_from_preview("5.11", &target, &TargetOverrides::default());

        assert_eq!(fix_target.memory, Some(536_870_912));
        assert_eq!(fix_target.cpu_shares, None);
        assert_eq!(fix_target.pids_limit, None);
    }

    #[test]
    fn cgroup_fix_target_allows_global_overrides() {
        let target = preview_target_with_suggestion("abcdef1234567890", "web");
        let overrides = TargetOverrides {
            memory: Some(1_073_741_824),
            strategy: Some("docker_update".to_string()),
            ..TargetOverrides::default()
        };
        let fix_target = fix_target_from_preview("5.11", &target, &overrides);

        assert_eq!(fix_target.memory, Some(1_073_741_824));
        assert_eq!(fix_target.strategy.as_deref(), Some("docker_update"));
    }

    fn preview_target(container_id: &str, container_name: &str) -> FixPreviewTarget {
        FixPreviewTarget {
            container_id: container_id.to_string(),
            container_name: container_name.to_string(),
            image: "alpine:3.20".to_string(),
            current_memory: None,
            current_cpu_shares: None,
            current_pids_limit: None,
            suggestion: None,
            strategy: "dokuru_override".to_string(),
            compose_project: None,
            compose_service: None,
            dockerfile_path: None,
            dockerfile_context: None,
            suggested_user: None,
            suggested_user_source: None,
        }
    }

    fn preview_target_with_suggestion(
        container_id: &str,
        container_name: &str,
    ) -> FixPreviewTarget {
        let mut target = preview_target(container_id, container_name);
        target.suggestion = Some(ResourceSuggestion {
            memory: 536_870_912,
            cpu_shares: 512,
            pids_limit: 256,
        });
        target
    }
}
