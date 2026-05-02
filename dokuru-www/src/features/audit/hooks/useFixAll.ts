import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResult, type FixOutcome, type FixPreviewTarget, type FixTarget } from "@/lib/api/agent-direct";
import { getSuggestedLimits } from "@/features/audit/hooks/useFix";
import { useAuditStore } from "@/stores/use-audit-store";

export type FixAllStep = "confirm" | "configure" | "applying" | "result";

export type RuleFixStatus = {
    ruleId: string;
    title: string;
    outcome: FixOutcome | null;
    state: "pending" | "applying" | "done" | "skipped";
    selected: boolean;
    highRisk: boolean;
};

const HIGH_RISK_AUTO_FIX_RULES = new Set(["1.1.1", "2.10", "4.1", "5.5", "5.10", "5.16", "5.17", "5.21", "5.31"]);
const CGROUP_RULE_IDS = ["5.11", "5.12", "5.29"] as const;

export type CgroupRuleId = typeof CGROUP_RULE_IDS[number];

export type CgroupTargetConfig = {
    key: string;
    containerId: string;
    containerName: string;
    image: string;
    composeProject?: string;
    composeService?: string;
    strategy: "docker_update" | "compose_update";
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

function cgroupTargetKey(target: FixPreviewTarget) {
    return target.compose_project && target.compose_service
        ? `compose:${target.compose_project}:${target.compose_service}`
        : `container:${target.container_id}`;
}

function cgroupStrategy(target: FixPreviewTarget): CgroupTargetConfig["strategy"] {
    return target.strategy === "compose_update" ? "compose_update" : "docker_update";
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

function cgroupTargetsForRule(ruleId: string, targets: CgroupTargetConfig[]): FixTarget[] {
    if (!isBulkCgroupRule(ruleId)) return [];

    return targets
        .filter((target) => target.ruleIds.includes(ruleId))
        .map((target) => {
            const payload: FixTarget = {
                container_id: target.containerId,
                strategy: target.strategy,
            };

            if (ruleId === "5.11") payload.memory = Math.max(1, target.memoryMb) * 1024 * 1024;
            if (ruleId === "5.12") payload.cpu_shares = Math.max(2, target.cpuShares);
            if (ruleId === "5.29") payload.pids_limit = Math.max(1, target.pidsLimit);
            return payload;
        });
}

interface UseFixAllArgs {
    agentId: string;
    agentUrl: string;
    agentAccessMode?: string;
    token?: string;
}

export function useFixAll({ agentId, agentUrl, agentAccessMode, token }: UseFixAllArgs) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<FixAllStep>("confirm");
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [ruleStatuses, setRuleStatuses] = useState<RuleFixStatus[]>([]);
    const [cgroupTargets, setCgroupTargets] = useState<CgroupTargetConfig[]>([]);
    const [cgroupLoading, setCgroupLoading] = useState(false);

    const queryClient = useQueryClient();
    const startFixJob = useAuditStore((state) => state.startFixJob);

    const openFixAll = useCallback((rules: AuditResult[]) => {
        setRuleStatuses(rules.map(r => ({
            ruleId: r.rule.id,
            title: r.rule.title,
            outcome: null,
            state: "pending",
            selected: !HIGH_RISK_AUTO_FIX_RULES.has(r.rule.id),
            highRisk: HIGH_RISK_AUTO_FIX_RULES.has(r.rule.id),
        })));
        setStep("confirm");
        setCurrentIndex(-1);
        setCgroupTargets([]);
        setCgroupLoading(false);
        setOpen(true);
    }, []);

    const toggleRule = useCallback((ruleId: string) => {
        setRuleStatuses(statuses => statuses.map(status => (
            status.ruleId === ruleId && status.state === "pending"
                ? { ...status, selected: !status.selected }
                : status
        )));
    }, []);

    const setAllSelected = useCallback((selected: boolean) => {
        setRuleStatuses(statuses => statuses.map(status => (
            status.state === "pending" ? { ...status, selected } : status
        )));
    }, []);

    const updateCgroupTarget = useCallback((key: string, patch: Partial<CgroupTargetConfig>) => {
        setCgroupTargets((targets) => targets.map((target) => (
            target.key === key ? { ...target, ...patch } : target
        )));
    }, []);

    const backToConfirm = useCallback(() => {
        setStep("confirm");
    }, []);

    const closeFixAll = useCallback(() => {
        setOpen(false);
        setTimeout(() => {
            setStep("confirm");
            setCurrentIndex(-1);
            setRuleStatuses([]);
            setCgroupTargets([]);
            setCgroupLoading(false);
        }, 300);
    }, []);

    const loadCgroupConfig = useCallback(async (ruleIds: CgroupRuleId[]) => {
        setCgroupLoading(true);
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

            setCgroupTargets(Array.from(configs.values()).sort((a, b) => {
                const projectCompare = (a.composeProject ?? "").localeCompare(b.composeProject ?? "");
                if (projectCompare !== 0) return projectCompare;
                return (a.composeService ?? a.containerName).localeCompare(b.composeService ?? b.containerName);
            }));
            setStep("configure");
        } catch {
            toast.error("Failed to load cgroup resource preview");
        } finally {
            setCgroupLoading(false);
        }
    }, [agentAccessMode, agentId, agentUrl, token]);

    const applyAll = useCallback(async () => {
        const selectedTotal = ruleStatuses.filter(r => r.selected).length;
        if (selectedTotal === 0) {
            toast.error("Select at least one rule to fix");
            return;
        }

        const selectedCgroupRuleIds = selectedCgroupRules(ruleStatuses);
        if (step === "confirm" && selectedCgroupRuleIds.length > 0) {
            await loadCgroupConfig(selectedCgroupRuleIds);
            return;
        }

        setStep("applying");
        const updated: RuleFixStatus[] = ruleStatuses.map(r => ({
            ...r,
            state: r.selected ? "pending" : "skipped",
        }));
        let appliedIndex = 0;

        for (let i = 0; i < updated.length; i++) {
            if (!updated[i].selected) continue;

            setCurrentIndex(appliedIndex);
            updated[i].state = "applying";
            setRuleStatuses([...updated]);

            try {
                updated[i].outcome = await startFixJob({
                    agentId,
                    agentUrl,
                    agentAccessMode,
                    token,
                    ruleId: updated[i].ruleId,
                    targets: cgroupTargetsForRule(updated[i].ruleId, cgroupTargets),
                });
                updated[i].state = "done";
            } catch {
                updated[i].outcome = {
                    rule_id: updated[i].ruleId,
                    status: "Blocked",
                    message: "Failed to reach agent",
                    requires_restart: false,
                    restart_command: undefined,
                    requires_elevation: false,
                };
                updated[i].state = "done";
            }
            setRuleStatuses([...updated]);
            appliedIndex += 1;
        }

        setCurrentIndex(selectedTotal);
        setStep("result");

        const selected = updated.filter(r => r.selected);
        const applied = selected.filter(r => r.outcome?.status === "Applied").length;
        const blocked = selected.filter(r => r.outcome?.status === "Blocked").length;

        if (applied > 0) {
            toast.success(`Applied ${applied} fix${applied > 1 ? "es" : ""}${blocked > 0 ? `, ${blocked} blocked` : ""}`);
            await queryClient.invalidateQueries({ queryKey: ["agent-audit"] });
        } else {
            toast.error("No fixes could be applied");
        }
    }, [agentAccessMode, agentId, agentUrl, cgroupTargets, loadCgroupConfig, queryClient, ruleStatuses, startFixJob, step, token]);

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
        toggleRule,
        setAllSelected,
        updateCgroupTarget,
        backToConfirm,
    };
}
