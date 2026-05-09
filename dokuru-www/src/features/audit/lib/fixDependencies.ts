import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResult, type FixOutcome, type FixProgress } from "@/lib/api/agent-direct";
import { useAuditStore, type AutoTriggeredFixJobMeta } from "@/stores/use-audit-store";

export const CGROUP_RESOURCE_RULE_IDS = ["5.11", "5.12", "5.29"] as const;
const DAEMON_JSON_TRIGGER_RULE_IDS = ["2.10", "2.15"] as const;

export type AutoVerifyDependency = {
  ruleId: string;
  title: string;
  label: string;
  triggerRuleIds: string[];
};

export type AutoVerifyRun = {
  dependency: AutoVerifyDependency;
  outcome: FixOutcome;
  progressEvents: FixProgress[];
};

type RunAutoTriggeredVerificationsArgs = {
  agentId: string;
  agentUrl: string;
  agentAccessMode?: string;
  token?: string;
  triggerRuleIds: string[];
  appendToRuleIds?: string[];
  skipRuleIds?: string[];
  onDependencyStart?: (dependency: AutoVerifyDependency, progressEvents: FixProgress[]) => void;
  onDependencyComplete?: (run: AutoVerifyRun) => void;
};

export function autoVerifyDependenciesForRules(ruleIds: Iterable<string>) {
  const rules = Array.from(new Set(ruleIds));
  const dependencies: AutoVerifyDependency[] = [];
  const cgroupTriggers = rules.filter((ruleId) => (CGROUP_RESOURCE_RULE_IDS as readonly string[]).includes(ruleId));
  const daemonTriggers = rules.filter((ruleId) => (DAEMON_JSON_TRIGGER_RULE_IDS as readonly string[]).includes(ruleId));

  if (cgroupTriggers.length > 0) {
    dependencies.push({
      ruleId: "5.25",
      title: "Ensure that cgroup usage is confirmed",
      label: "Auto-triggered cgroup ensure",
      triggerRuleIds: cgroupTriggers,
    });
  }

  if (daemonTriggers.length > 0) {
    dependencies.push({
      ruleId: "1.1.11",
      title: "Ensure that /etc/docker/daemon.json is audited",
      label: "Auto-triggered daemon.json audit ensure",
      triggerRuleIds: daemonTriggers,
    });
  }

  return dependencies;
}

export function isAutoTriggeredFixJob(job: { autoTriggered?: boolean } | undefined) {
  return job?.autoTriggered === true;
}

export function autoTriggerMeta(dependency: AutoVerifyDependency): AutoTriggeredFixJobMeta {
  return {
    autoTriggered: true,
    triggeredByRuleIds: dependency.triggerRuleIds,
    triggerLabel: dependency.label,
  };
}

function verifyProgress(
  dependency: AutoVerifyDependency,
  status: FixProgress["status"],
  detail: string,
  result?: AuditResult,
): FixProgress {
  return {
    rule_id: dependency.ruleId,
    container_name: "dokuru-agent",
    step: 1,
    total_steps: 1,
    action: "auto_trigger_verify_audit_rule",
    status,
    detail,
    command: result?.audit_command,
    stdout: result?.raw_output,
    stderr: result?.command_stderr,
  };
}

function outcomeFromVerifyResult(dependency: AutoVerifyDependency, result: AuditResult): FixOutcome {
  const passed = result.status === "Pass";
  return {
    rule_id: dependency.ruleId,
    status: passed ? "Applied" : "Blocked",
    message: passed
      ? `${dependency.ruleId} passed automatic verification triggered by ${dependency.triggerRuleIds.join(", ")}`
      : `${dependency.ruleId} still fails automatic verification: ${result.message}`,
    requires_restart: false,
    restart_command: undefined,
    requires_elevation: false,
  };
}

async function verifyRuleNow({
  agentId,
  agentUrl,
  agentAccessMode,
  token,
  ruleId,
}: {
  agentId: string;
  agentUrl: string;
  agentAccessMode?: string;
  token?: string;
  ruleId: string;
}) {
  return agentAccessMode === "relay"
    ? await agentApi.verifyFix(agentId, ruleId)
    : await agentDirectApi.verifyFix(agentUrl, ruleId, token);
}

export async function runAutoTriggeredVerifications({
  agentId,
  agentUrl,
  agentAccessMode,
  token,
  triggerRuleIds,
  appendToRuleIds,
  skipRuleIds = [],
  onDependencyStart,
  onDependencyComplete,
}: RunAutoTriggeredVerificationsArgs) {
  const skipped = new Set(skipRuleIds);
  const dependencies = autoVerifyDependenciesForRules(triggerRuleIds).filter((dependency) => !skipped.has(dependency.ruleId));
  const runs: AutoVerifyRun[] = [];

  for (const dependency of dependencies) {
    const meta = autoTriggerMeta(dependency);
    const parentRuleIds = appendToRuleIds ?? dependency.triggerRuleIds;
    const started = verifyProgress(
      dependency,
      "in_progress",
      `${dependency.label}: verifying ${dependency.ruleId} after ${dependency.triggerRuleIds.join(", ")}`,
    );

    useAuditStore.getState().startSyntheticFixJob(agentId, dependency.ruleId, meta);
    for (const ruleId of parentRuleIds) {
      useAuditStore.getState().appendFixJobProgress(agentId, ruleId, [started]);
    }
    onDependencyStart?.(dependency, [started]);

    try {
      const result = await verifyRuleNow({ agentId, agentUrl, agentAccessMode, token, ruleId: dependency.ruleId });
      const outcome = outcomeFromVerifyResult(dependency, result);
      const completed = verifyProgress(dependency, result.status === "Pass" ? "done" : "error", result.message, result);
      const progressEvents = [started, completed];
      useAuditStore.getState().completeFixJob(agentId, dependency.ruleId, outcome, progressEvents, meta);
      for (const ruleId of parentRuleIds) {
        useAuditStore.getState().appendFixJobProgress(agentId, ruleId, [completed]);
      }
      const run = { dependency, outcome, progressEvents };
      runs.push(run);
      onDependencyComplete?.(run);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Automatic verification failed";
      const outcome: FixOutcome = {
        rule_id: dependency.ruleId,
        status: "Blocked",
        message: `${dependency.ruleId} automatic verification failed: ${message}`,
        requires_restart: false,
        restart_command: undefined,
        requires_elevation: false,
      };
      const failed = verifyProgress(dependency, "error", message);
      const progressEvents = [started, failed];
      useAuditStore.getState().completeFixJob(agentId, dependency.ruleId, outcome, progressEvents, meta);
      for (const ruleId of parentRuleIds) {
        useAuditStore.getState().appendFixJobProgress(agentId, ruleId, [failed]);
      }
      const run = { dependency, outcome, progressEvents };
      runs.push(run);
      onDependencyComplete?.(run);
    }
  }

  return runs;
}
