import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResult, type FixOutcome, type FixPreviewTarget, type FixProgress, type FixTarget } from "@/lib/api/agent-direct";
import {
    getSuggestedLimits,
    isImageConfigRecreateRule,
    isNamespaceIsolationRule,
    isRuntimeIsolationRule,
} from "@/features/audit/hooks/useFix";
import { type AutoVerifyDependency, type AutoVerifyRun, CGROUP_RESOURCE_RULE_IDS, runAutoTriggeredVerifications } from "@/features/audit/lib/fixDependencies";
import { FIX_CANCELLED_MESSAGE, fixJobKey, isAgentAuditWorkspacePath, useAuditStore } from "@/stores/use-audit-store";

function shouldShowRouteFixToast(agentId: string) {
    if (typeof window === "undefined") return false;
    return isAgentAuditWorkspacePath(window.location.pathname, agentId);
}

export type FixAllStep = "confirm" | "configure" | "applying" | "result";

export type RuleFixStatus = {
    ruleId: string;
    title: string;
    outcome: FixOutcome | null;
    progressEvents: FixProgress[];
    state: "pending" | "applying" | "done" | "skipped" | "cancelled";
    selected: boolean;
    highRisk: boolean;
    autoTriggered?: boolean;
    triggeredByRuleIds?: string[];
};

const HIGH_RISK_AUTO_FIX_RULES = new Set(["2.10", "2.15", "4.1", "5.4", "5.5", "5.10", "5.16", "5.17", "5.18", "5.21", "5.22", "5.31"]);
const CGROUP_RULE_IDS = ["5.11", "5.12", "5.25", "5.29"] as const;
const MIN_CGROUP_VALUES = {
    memoryMb: 64,
    cpuShares: 128,
    pidsLimit: 50,
} as const;

export type CgroupRuleId = typeof CGROUP_RULE_IDS[number];

export type CgroupTargetConfig = {
    key: string;
    containerId: string;
    containerName: string;
    image: string;
    composeProject?: string;
    composeService?: string;
    strategy: "docker_update" | "compose_update" | "dokuru_override";
    ruleIds: CgroupRuleId[];
    memoryMb: number;
    cpuShares: number;
    pidsLimit: number;
};

export function isBulkCgroupRule(ruleId: string): ruleId is CgroupRuleId {
    return (CGROUP_RULE_IDS as readonly string[]).includes(ruleId);
}

function selectedCgroupRules(ruleStatuses: RuleFixStatus[]): CgroupRuleId[] {
    return ruleStatuses.flatMap((status) => (
        status.selected && isBulkCgroupRule(status.ruleId) ? [status.ruleId] : []
    ));
}

function concreteCgroupRuleIds(ruleIds: CgroupRuleId[]) {
    return ruleIds.filter((ruleId) => (CGROUP_RESOURCE_RULE_IDS as readonly string[]).includes(ruleId));
}

function cgroupTargetKey(target: FixPreviewTarget) {
    return target.compose_project && target.compose_service
        ? `compose:${target.compose_project}:${target.compose_service}`
        : `container:${target.container_id}`;
}

function cgroupStrategy(target: FixPreviewTarget): CgroupTargetConfig["strategy"] {
    return target.strategy === "dokuru_override" || target.strategy === "compose_update" ? target.strategy : "docker_update";
}

function mergeCgroupTarget(
    configs: Map<string, CgroupTargetConfig>,
    ruleId: CgroupRuleId,
    target: FixPreviewTarget,
) {
    const key = cgroupTargetKey(target);
    const existing = configs.get(key);
    const fallback = getSuggestedLimits(target.container_name || target.compose_service || target.image);
    const ruleIds = existing?.ruleIds.includes(ruleId)
        ? existing.ruleIds
        : [...(existing?.ruleIds ?? []), ruleId];

    configs.set(key, {
        key,
        containerId: existing?.containerId ?? target.container_id,
        containerName: existing?.containerName ?? target.container_name,
        image: existing?.image ?? target.image,
        composeProject: existing?.composeProject ?? target.compose_project,
        composeService: existing?.composeService ?? target.compose_service,
        strategy: existing?.strategy ?? cgroupStrategy(target),
        ruleIds,
        memoryMb: existing?.memoryMb ?? (target.suggestion ? Math.round(target.suggestion.memory / 1024 / 1024) : fallback.memoryMb),
        cpuShares: existing?.cpuShares ?? target.suggestion?.cpu_shares ?? fallback.cpuShares,
        pidsLimit: existing?.pidsLimit ?? target.suggestion?.pids_limit ?? fallback.pidsLimit,
    });
}

function cgroupTargetsForRule(
    ruleId: string,
    targets: CgroupTargetConfig[],
    currentTargets?: Map<string, FixPreviewTarget>,
): FixTarget[] {
    if (!isBulkCgroupRule(ruleId)) return [];

    return targets
        .filter((target) => target.ruleIds.includes(ruleId))
        .flatMap((target) => {
            const currentTarget = currentTargets?.get(target.key)
                ?? currentTargets?.get(`name:${target.containerName}`);
            if (currentTargets && !currentTarget) return [];

            const payload: FixTarget = {
                container_id: currentTarget?.container_id ?? target.containerId,
                strategy: target.strategy,
                container_name: currentTarget?.container_name ?? target.containerName,
                image: currentTarget?.image ?? target.image,
                compose_project: currentTarget?.compose_project ?? target.composeProject,
                compose_service: currentTarget?.compose_service ?? target.composeService,
            };

            if (ruleId === "5.11" || ruleId === "5.25") payload.memory = Math.max(MIN_CGROUP_VALUES.memoryMb, target.memoryMb) * 1024 * 1024;
            if (ruleId === "5.12") payload.cpu_shares = Math.max(MIN_CGROUP_VALUES.cpuShares, target.cpuShares);
            if (ruleId === "5.29") payload.pids_limit = Math.max(MIN_CGROUP_VALUES.pidsLimit, target.pidsLimit);
            return [payload];
        });
}

function invalidCgroupTarget(ruleIds: CgroupRuleId[], targets: CgroupTargetConfig[]) {
    for (const target of targets) {
        if (ruleIds.includes("5.11") && target.ruleIds.some((ruleId) => ruleId === "5.11")) {
            if (!Number.isFinite(target.memoryMb) || target.memoryMb < MIN_CGROUP_VALUES.memoryMb) return "memory";
        }
        if (ruleIds.includes("5.12") && target.ruleIds.some((ruleId) => ruleId === "5.12")) {
            if (!Number.isFinite(target.cpuShares) || target.cpuShares < MIN_CGROUP_VALUES.cpuShares) return "CPU shares";
        }
        if (ruleIds.includes("5.29") && target.ruleIds.some((ruleId) => ruleId === "5.29")) {
            if (!Number.isFinite(target.pidsLimit) || target.pidsLimit < MIN_CGROUP_VALUES.pidsLimit) return "PIDs";
        }
    }
    return null;
}

function cancelledOutcome(ruleId: string): FixOutcome {
    return {
        rule_id: ruleId,
        status: "Blocked",
        message: FIX_CANCELLED_MESSAGE,
        requires_restart: false,
        restart_command: undefined,
        requires_elevation: false,
    };
}

function refreshProgress(ruleId: string, status: FixProgress["status"], detail: string): FixProgress {
    return {
        rule_id: ruleId,
        container_name: "dokuru-agent",
        step: 1,
        total_steps: 3,
        action: "refresh_current_targets",
        status,
        detail,
        command: `GET /fix/preview?rule_id=${encodeURIComponent(ruleId)}`,
    };
}

function verifyProgress(ruleId: string, status: FixProgress["status"], detail: string, result?: AuditResult): FixProgress {
    return {
        rule_id: ruleId,
        container_name: "dokuru-agent",
        step: 1,
        total_steps: 1,
        action: "verify_audit_rule",
        status,
        detail,
        command: result?.audit_command,
        stdout: result?.raw_output,
        stderr: result?.command_stderr,
    };
}

function isBulkPreviewTargetRule(ruleId: string) {
    return isImageConfigRecreateRule(ruleId)
        || isNamespaceIsolationRule(ruleId)
        || isRuntimeIsolationRule(ruleId);
}

function previewTargetsForRule(ruleId: string, previewTargets: FixPreviewTarget[]): FixTarget[] {
    return previewTargets.map((target) => ({
        container_id: target.container_id,
        strategy: target.strategy,
        container_name: target.container_name,
        image: target.image,
        compose_project: target.compose_project,
        compose_service: target.compose_service,
        user: ruleId === "4.1" ? target.suggested_user : undefined,
    }));
}

interface UseFixAllArgs {
    agentId: string;
    agentUrl: string;
    agentAccessMode?: string;
    token?: string;
    auditTimestamp?: string;
}

type FixAllSessionState = {
    open: boolean;
    step: FixAllStep;
    currentIndex: number;
    ruleStatuses: RuleFixStatus[];
    cgroupTargets: CgroupTargetConfig[];
    cgroupLoading: boolean;
};

const fixAllSessions = new Map<string, FixAllSessionState>();
const fixAllSessionListeners = new Map<string, Set<() => void>>();

const EMPTY_FIX_ALL_SESSION: FixAllSessionState = {
    open: false,
    step: "confirm",
    currentIndex: -1,
    ruleStatuses: [],
    cgroupTargets: [],
    cgroupLoading: false,
};

function emptyFixAllSession(): FixAllSessionState {
    return { ...EMPTY_FIX_ALL_SESSION };
}

function shouldPersistFixAllSession(state: FixAllSessionState) {
    return state.open
        || state.step === "applying"
        || state.step === "result"
        || state.ruleStatuses.length > 0
        || state.cgroupTargets.length > 0
        || state.cgroupLoading;
}

function fixAllSessionKey(agentId: string, auditTimestamp?: string) {
    return `${agentId}:${auditTimestamp ?? "pending"}`;
}

function getFixAllSession(sessionKey: string) {
    return fixAllSessions.get(sessionKey) ?? EMPTY_FIX_ALL_SESSION;
}

function subscribeFixAllSession(sessionKey: string, listener: () => void) {
    const listeners = fixAllSessionListeners.get(sessionKey) ?? new Set<() => void>();
    listeners.add(listener);
    fixAllSessionListeners.set(sessionKey, listeners);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) fixAllSessionListeners.delete(sessionKey);
    };
}

function publishFixAllSession(sessionKey: string) {
    fixAllSessionListeners.get(sessionKey)?.forEach((listener) => listener());
}

function createFixAllSession(rules: AuditResult[]): FixAllSessionState {
    return {
        ...emptyFixAllSession(),
        open: true,
        ruleStatuses: rules.map(r => ({
            ruleId: r.rule.id,
            title: r.rule.title,
            outcome: null,
            progressEvents: [],
            state: "pending",
            selected: !HIGH_RISK_AUTO_FIX_RULES.has(r.rule.id),
            highRisk: HIGH_RISK_AUTO_FIX_RULES.has(r.rule.id),
        })),
    };
}

function isSuccessfulFixAllResult(ruleStatuses: RuleFixStatus[]) {
    const selected = ruleStatuses.filter(status => status.selected);
    return selected.length > 0 && selected.every(status => status.outcome?.status === "Applied");
}

export function useFixAll({ agentId, agentUrl, agentAccessMode, token, auditTimestamp }: UseFixAllArgs) {
    const sessionKey = fixAllSessionKey(agentId, auditTimestamp);
    const session = useSyncExternalStore(
        useCallback((listener) => subscribeFixAllSession(sessionKey, listener), [sessionKey]),
        useCallback(() => getFixAllSession(sessionKey), [sessionKey]),
        () => EMPTY_FIX_ALL_SESSION,
    );
    const sessionRef = useRef(session);

    useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    const queryClient = useQueryClient();
    const startFixJob = useAuditStore((state) => state.startFixJob);
    const cancelFixJob = useAuditStore((state) => state.cancelFixJob);
    const completeFixJob = useAuditStore((state) => state.completeFixJob);
    const cancelRequestedRef = useRef(false);
    const activeRuleRef = useRef<string | null>(null);

    const commitSession = useCallback((updater: FixAllSessionState | ((current: FixAllSessionState) => FixAllSessionState)) => {
        const next = typeof updater === "function" ? updater(sessionRef.current) : updater;
        sessionRef.current = next;
        if (shouldPersistFixAllSession(next)) {
            fixAllSessions.set(sessionKey, next);
        } else {
            fixAllSessions.delete(sessionKey);
        }
        publishFixAllSession(sessionKey);
        return next;
    }, [sessionKey]);

    const { open, step, currentIndex, ruleStatuses, cgroupTargets, cgroupLoading } = session;

    const openFixAll = useCallback((rules: AuditResult[]) => {
        commitSession((current) => {
            if (current.step === "applying" && current.ruleStatuses.length > 0) {
                return { ...current, open: true };
            }

            if (current.step === "result" && isSuccessfulFixAllResult(current.ruleStatuses)) {
                return { ...current, open: true };
            }

            return createFixAllSession(rules);
        });
        cancelRequestedRef.current = false;
        activeRuleRef.current = null;
    }, [commitSession]);

    const toggleRule = useCallback((ruleId: string) => {
        commitSession((current) => ({
            ...current,
            ruleStatuses: current.ruleStatuses.map(status => (
                status.ruleId === ruleId && status.state === "pending"
                ? { ...status, selected: !status.selected }
                : status
            )),
        }));
    }, [commitSession]);

    const setAllSelected = useCallback((selected: boolean) => {
        commitSession((current) => ({
            ...current,
            ruleStatuses: current.ruleStatuses.map(status => (
                status.state === "pending" ? { ...status, selected } : status
            )),
        }));
    }, [commitSession]);

    const updateCgroupTarget = useCallback((key: string, patch: Partial<CgroupTargetConfig>) => {
        commitSession((current) => ({
            ...current,
            cgroupTargets: current.cgroupTargets.map((target) => (
                target.key === key ? { ...target, ...patch } : target
            )),
        }));
    }, [commitSession]);

    const backToConfirm = useCallback(() => {
        commitSession((current) => ({ ...current, step: "confirm" }));
    }, [commitSession]);

    const closeFixAll = useCallback(() => {
        commitSession((current) => {
            if (current.step === "applying") {
                return { ...current, open: false };
            }

            if (current.step === "result" && isSuccessfulFixAllResult(current.ruleStatuses)) {
                return { ...current, open: false };
            }

            cancelRequestedRef.current = false;
            activeRuleRef.current = null;
            return emptyFixAllSession();
        });
    }, [commitSession]);

    const loadCgroupConfig = useCallback(async (ruleIds: CgroupRuleId[]) => {
        commitSession((current) => ({ ...current, cgroupLoading: true }));
        try {
            const previews = await Promise.all(ruleIds.map(async (ruleId) => ({
                ruleId,
                preview: agentAccessMode === "relay"
                    ? await agentApi.previewFix(agentId, ruleId)
                    : await agentDirectApi.previewFix(agentUrl, ruleId, token),
            })));

            const configs = new Map<string, CgroupTargetConfig>();
            for (const { ruleId, preview } of previews) {
                for (const target of preview.targets) {
                    mergeCgroupTarget(configs, ruleId, target);
                }
            }

            commitSession((current) => ({
                ...current,
                cgroupTargets: Array.from(configs.values()).sort((a, b) => {
                    const projectCompare = (a.composeProject ?? "").localeCompare(b.composeProject ?? "");
                    if (projectCompare !== 0) return projectCompare;
                    return (a.composeService ?? a.containerName).localeCompare(b.composeService ?? b.containerName);
                }),
                cgroupLoading: false,
                step: "configure",
            }));
        } catch {
            toast.error("Failed to load cgroup resource preview");
            commitSession((current) => ({ ...current, cgroupLoading: false }));
        }
    }, [agentAccessMode, agentId, agentUrl, commitSession, token]);

    const refreshCgroupTargetsForRule = useCallback(async (ruleId: CgroupRuleId) => {
        const preview = agentAccessMode === "relay"
            ? await agentApi.previewFix(agentId, ruleId)
            : await agentDirectApi.previewFix(agentUrl, ruleId, token);
        const currentTargets = new Map<string, FixPreviewTarget>();
        for (const target of preview.targets) {
            currentTargets.set(cgroupTargetKey(target), target);
            if (target.container_name) currentTargets.set(`name:${target.container_name}`, target);
        }
        return cgroupTargetsForRule(
            ruleId,
            sessionRef.current.cgroupTargets,
            currentTargets,
        );
    }, [agentAccessMode, agentId, agentUrl, token]);

    const refreshPreviewTargetsForRule = useCallback(async (ruleId: string) => {
        const preview = agentAccessMode === "relay"
            ? await agentApi.previewFix(agentId, ruleId)
            : await agentDirectApi.previewFix(agentUrl, ruleId, token);
        return previewTargetsForRule(ruleId, preview.targets);
    }, [agentAccessMode, agentId, agentUrl, token]);

    const verifyRuleNow = useCallback(async (ruleId: string) => {
        const result = agentAccessMode === "relay"
            ? await agentApi.verifyFix(agentId, ruleId)
            : await agentDirectApi.verifyFix(agentUrl, ruleId, token);
        const passed = result.status === "Pass";
        const outcome: FixOutcome = {
            rule_id: ruleId,
            status: passed ? "Applied" : "Blocked",
            message: passed
                ? `${ruleId} passed real verification after selected fixes`
                : `${ruleId} still fails real verification: ${result.message}`,
            requires_restart: false,
            restart_command: undefined,
            requires_elevation: false,
        };
        return {
            outcome,
            progressEvent: verifyProgress(
                ruleId,
                passed ? "done" : "error",
                result.message,
                result,
            ),
        };
    }, [agentAccessMode, agentId, agentUrl, token]);

    const applyAll = useCallback(async () => {
        const activeSession = sessionRef.current;
        const activeRuleStatuses = activeSession.ruleStatuses;
        const activeCgroupTargets = activeSession.cgroupTargets;
        const activeStep = activeSession.step;
        const selectedTotal = activeRuleStatuses.filter(r => r.selected).length;
        if (selectedTotal === 0) {
            toast.error("Select at least one rule to fix");
            return;
        }

        const selectedCgroupRuleIds = selectedCgroupRules(activeRuleStatuses);
        const selectedConcreteCgroupRuleIds = concreteCgroupRuleIds(selectedCgroupRuleIds);
        if (selectedCgroupRuleIds.includes("5.25") && selectedConcreteCgroupRuleIds.length === 0) {
            toast.error("Select memory, CPU shares, or PIDs with 5.25 so Dokuru knows which cgroup limit to apply");
            return;
        }

        if (activeStep === "confirm" && selectedCgroupRuleIds.length > 0) {
            await loadCgroupConfig(selectedCgroupRuleIds);
            return;
        }

        if (activeStep === "configure") {
            const invalidField = invalidCgroupTarget(selectedCgroupRuleIds, activeCgroupTargets);
            if (invalidField) {
                toast.error(`Enter a valid minimum value for ${invalidField} before applying fixes`);
                return;
            }
        }

        cancelRequestedRef.current = false;
        const updated: RuleFixStatus[] = activeRuleStatuses.map(r => ({
            ...r,
            state: r.selected ? "pending" : "skipped",
        }));
        commitSession((current) => ({ ...current, step: "applying", ruleStatuses: [...updated] }));
        let appliedIndex = 0;
        const selectedIndexes = updated.flatMap((status, index) => status.selected ? [index] : []);
        const orderedIndexes = selectedConcreteCgroupRuleIds.length > 0
            ? [...selectedIndexes].sort((a, b) => {
                const aIsCgroupUsage = updated[a].ruleId === "5.25";
                const bIsCgroupUsage = updated[b].ruleId === "5.25";
                if (aIsCgroupUsage !== bIsCgroupUsage) return aIsCgroupUsage ? 1 : -1;
                return selectedIndexes.indexOf(a) - selectedIndexes.indexOf(b);
            })
            : selectedIndexes;

        for (let orderIndex = 0; orderIndex < orderedIndexes.length; orderIndex += 1) {
            const i = orderedIndexes[orderIndex];
            if (cancelRequestedRef.current) {
                updated[i].outcome = cancelledOutcome(updated[i].ruleId);
                updated[i].state = "cancelled";
                continue;
            }
            const ruleId = updated[i].ruleId;

            updated[i].state = "applying";
            commitSession((current) => ({ ...current, currentIndex: appliedIndex, ruleStatuses: [...updated] }));
            activeRuleRef.current = ruleId;

            try {
                let targets = cgroupTargetsForRule(ruleId, activeCgroupTargets);

                if (isBulkCgroupRule(ruleId)) {
                    const cgroupUsageCoveredBySelectedResources = ruleId === "5.25" && selectedConcreteCgroupRuleIds.length > 0;
                    if (cgroupUsageCoveredBySelectedResources) {
                        const running = verifyProgress(
                            ruleId,
                            "in_progress",
                            "Running real 5.25 verification after selected cgroup limit fixes",
                        );
                        updated[i].progressEvents = [running];
                        commitSession((current) => ({ ...current, ruleStatuses: [...updated] }));

                        const verified = await verifyRuleNow(ruleId);
                        updated[i].outcome = verified.outcome;
                        updated[i].progressEvents = [running, verified.progressEvent];
                        updated[i].state = "done";
                        completeFixJob(agentId, ruleId, verified.outcome, updated[i].progressEvents);
                        commitSession((current) => ({ ...current, ruleStatuses: [...updated] }));
                        activeRuleRef.current = null;
                        appliedIndex += 1;
                        continue;
                    }

                    const refreshedTargets = await refreshCgroupTargetsForRule(ruleId);
                    targets = refreshedTargets;
                    updated[i].progressEvents = [refreshProgress(
                        ruleId,
                        "done",
                        refreshedTargets.length > 0
                            ? `Resolved ${refreshedTargets.length} current cgroup target(s) before applying`
                            : "No current cgroup targets still need this rule; skipped backend apply to avoid defaulting stale targets",
                    )];
                    commitSession((current) => ({ ...current, ruleStatuses: [...updated] }));

                    if (targets.length === 0) {
                        const outcome = {
                            rule_id: ruleId,
                            status: "Applied",
                            message: "No current cgroup targets still need this rule",
                            requires_restart: false,
                            restart_command: undefined,
                            requires_elevation: false,
                        } satisfies FixOutcome;
                        updated[i].outcome = outcome;
                        updated[i].state = "done";
                        completeFixJob(agentId, ruleId, outcome, updated[i].progressEvents);
                        commitSession((current) => ({ ...current, ruleStatuses: [...updated] }));
                        activeRuleRef.current = null;
                        appliedIndex += 1;
                        continue;
                    }
                } else if (isBulkPreviewTargetRule(ruleId)) {
                    const refreshedTargets = await refreshPreviewTargetsForRule(ruleId);
                    targets = refreshedTargets;
                    updated[i].progressEvents = [refreshProgress(
                        ruleId,
                        "done",
                        refreshedTargets.length > 0
                            ? `Resolved ${refreshedTargets.length} current target(s) before applying`
                            : "No current targets still need this rule; skipped backend apply to avoid defaulting stale targets",
                    )];
                    commitSession((current) => ({ ...current, ruleStatuses: [...updated] }));

                    if (targets.length === 0) {
                        const outcome = {
                            rule_id: ruleId,
                            status: "Applied",
                            message: "No current targets still need this rule",
                            requires_restart: false,
                            restart_command: undefined,
                            requires_elevation: false,
                        } satisfies FixOutcome;
                        updated[i].outcome = outcome;
                        updated[i].state = "done";
                        completeFixJob(agentId, ruleId, outcome, updated[i].progressEvents);
                        commitSession((current) => ({ ...current, ruleStatuses: [...updated] }));
                        activeRuleRef.current = null;
                        appliedIndex += 1;
                        continue;
                    }
                }

                if (cancelRequestedRef.current) {
                    throw new Error(FIX_CANCELLED_MESSAGE);
                }

                updated[i].outcome = await startFixJob({
                    agentId,
                    agentUrl,
                    agentAccessMode,
                    token,
                    ruleId,
                    targets,
                });
                updated[i].progressEvents = [
                    ...updated[i].progressEvents,
                    ...(useAuditStore.getState().fixJobs[fixJobKey(agentId, ruleId)]?.progressEvents ?? []),
                ];
                updated[i].state = "done";
            } catch (error) {
                const cancelled = cancelRequestedRef.current || (error instanceof Error && error.message === FIX_CANCELLED_MESSAGE);
                const outcome: FixOutcome = cancelled
                    ? cancelledOutcome(updated[i].ruleId)
                    : {
                        rule_id: ruleId,
                        status: "Blocked",
                        message: error instanceof Error ? error.message : "Failed to reach agent",
                        requires_restart: false,
                        restart_command: undefined,
                        requires_elevation: false,
                    };
                updated[i].outcome = outcome;
                updated[i].progressEvents = [
                    ...updated[i].progressEvents,
                    ...(useAuditStore.getState().fixJobs[fixJobKey(agentId, ruleId)]?.progressEvents ?? []),
                    ...((isBulkCgroupRule(ruleId) || isBulkPreviewTargetRule(ruleId)) && !cancelled && updated[i].progressEvents.length === 0
                        ? [refreshProgress(ruleId, "error", outcome.message)]
                        : []),
                ];
                updated[i].state = cancelled ? "cancelled" : "done";
            }
            activeRuleRef.current = null;
            commitSession((current) => ({ ...current, ruleStatuses: [...updated] }));
            appliedIndex += 1;

            if (cancelRequestedRef.current) {
                for (const nextIndex of orderedIndexes.slice(orderIndex + 1)) {
                    updated[nextIndex].outcome = cancelledOutcome(updated[nextIndex].ruleId);
                    updated[nextIndex].state = "cancelled";
                }
                break;
            }
        }

        activeRuleRef.current = null;

        const successfulTriggerRuleIds = updated
            .filter((status) => status.selected && status.outcome?.status === "Applied")
            .map((status) => status.ruleId);
        const alreadyAppliedDependentRuleIds = updated
            .filter((status) => status.outcome?.status === "Applied")
            .map((status) => status.ruleId);

        function ensureAutoTriggeredStatus(dependency: AutoVerifyDependency, state: RuleFixStatus["state"], progressEvents: FixProgress[], outcome: FixOutcome | null) {
            const existingIndex = updated.findIndex((status) => status.ruleId === dependency.ruleId);
            const nextStatus: RuleFixStatus = existingIndex >= 0
                ? {
                    ...updated[existingIndex],
                    selected: true,
                    state,
                    outcome,
                    progressEvents,
                    autoTriggered: true,
                    triggeredByRuleIds: dependency.triggerRuleIds,
                }
                : {
                    ruleId: dependency.ruleId,
                    title: dependency.title,
                    outcome,
                    progressEvents,
                    state,
                    selected: true,
                    highRisk: false,
                    autoTriggered: true,
                    triggeredByRuleIds: dependency.triggerRuleIds,
                };

            if (existingIndex >= 0) {
                updated[existingIndex] = nextStatus;
            } else {
                updated.push(nextStatus);
            }
        }

        function appendAutoVerifyEventsToTriggers(dependency: AutoVerifyDependency, events: FixProgress[]) {
            for (const triggerRuleId of dependency.triggerRuleIds) {
                const index = updated.findIndex((status) => status.ruleId === triggerRuleId);
                if (index >= 0) {
                    updated[index] = {
                        ...updated[index],
                        progressEvents: [...updated[index].progressEvents, ...events],
                    };
                }
            }
        }

        if (!cancelRequestedRef.current && successfulTriggerRuleIds.length > 0) {
            await runAutoTriggeredVerifications({
                agentId,
                agentUrl,
                agentAccessMode,
                token,
                triggerRuleIds: successfulTriggerRuleIds,
                skipRuleIds: alreadyAppliedDependentRuleIds,
                auditTimestamp,
                onDependencyStart: (dependency, progressEvents) => {
                    activeRuleRef.current = dependency.ruleId;
                    ensureAutoTriggeredStatus(dependency, "applying", progressEvents, null);
                    appendAutoVerifyEventsToTriggers(dependency, progressEvents);
                    commitSession((current) => ({
                        ...current,
                        currentIndex: updated.filter((status) => status.selected && status.state === "done").length,
                        ruleStatuses: [...updated],
                    }));
                },
                onDependencyComplete: (run: AutoVerifyRun) => {
                    ensureAutoTriggeredStatus(run.dependency, "done", run.progressEvents, run.outcome);
                    appendAutoVerifyEventsToTriggers(run.dependency, run.progressEvents.slice(1));
                    commitSession((current) => ({
                        ...current,
                        ruleStatuses: [...updated],
                    }));
                },
            });
            activeRuleRef.current = null;
        }

        commitSession((current) => ({ ...current, currentIndex: updated.filter((status) => status.selected).length, step: "result", ruleStatuses: [...updated] }));

        const selected = updated.filter(r => r.selected);
        const applied = selected.filter(r => r.outcome?.status === "Applied").length;
        const blocked = selected.filter(r => r.outcome?.status === "Blocked").length;

        if (selected.length > 0) {
            await queryClient.invalidateQueries({ queryKey: ["fix-history"] });
        }

        const showRouteToast = shouldShowRouteFixToast(agentId);

        if (cancelRequestedRef.current) {
            if (showRouteToast) {
                toast.error("Fix All cancelled");
            }
        } else if (applied > 0) {
            if (showRouteToast) {
                toast.success(`Applied ${applied} fix${applied > 1 ? "es" : ""}${blocked > 0 ? `, ${blocked} blocked` : ""}`);
            }
            await queryClient.invalidateQueries({ queryKey: ["agent-audit"] });
        } else {
            if (showRouteToast) {
                toast.error("No fixes could be applied");
            }
        }
    }, [agentId, agentUrl, agentAccessMode, auditTimestamp, commitSession, completeFixJob, loadCgroupConfig, queryClient, refreshCgroupTargetsForRule, refreshPreviewTargetsForRule, startFixJob, token, verifyRuleNow]);

    const cancelApplyAll = useCallback(() => {
        cancelRequestedRef.current = true;
        if (activeRuleRef.current) {
            cancelFixJob(agentId, activeRuleRef.current);
        }
    }, [agentId, cancelFixJob]);

    const selectedCount = ruleStatuses.filter(r => r.selected).length;
    const selectedCgroupRuleIds = selectedCgroupRules(ruleStatuses);

    return {
        open,
        step,
        currentIndex,
        ruleStatuses,
        selectedCount,
        cgroupTargets,
        cgroupLoading,
        selectedCgroupRuleIds,
        openFixAll,
        closeFixAll,
        applyAll,
        cancelApplyAll,
        toggleRule,
        setAllSelected,
        updateCgroupTarget,
        backToConfirm,
    };
}
