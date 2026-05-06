import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResult, type FixOutcome, type FixPreview, type FixTarget } from "@/lib/api/agent-direct";
import { FIX_CANCELLED_MESSAGE, fixJobKey, isAgentAuditWorkspacePath, useAuditStore, type FixJobState } from "@/stores/use-audit-store";

export type WizardStep = "confirm" | "applying" | "result";

function shouldShowRouteFixToast(agentId: string) {
    if (typeof window === "undefined") return false;
    return isAgentAuditWorkspacePath(window.location.pathname, agentId);
}

export function getFixSteps(ruleId: string): string[] {
    if (ruleId === "4.1") return [
        "Finding containers running as root…",
        "Migrating writable mount permissions…",
        "Stopping affected container(s)…",
        "Recreating with user 1000:1000…",
        "Starting container(s)…",
        "Verifying non-root user config…",
    ];
    if (ruleId === "4.6") return [
        "Finding containers without healthchecks…",
        "Saving container or Compose configuration…",
        "Stopping affected container(s)…",
        "Recreating with default healthcheck…",
        "Starting container(s)…",
        "Verifying healthcheck config…",
    ];
    if (ruleId === "5.4") return [
        "Inspecting container capabilities…",
        "Saving container or Compose configuration…",
        "Stopping affected container(s)…",
        "Recreating with NET_RAW dropped…",
        "Starting container(s)…",
        "Verifying capability restrictions…",
    ];
    if (ruleId === "5.5") return [
        "Inspecting containers running with --privileged…",
        "Saving container configuration…",
        "Stopping privileged container(s)…",
        "Removing old container(s)…",
        "Recreating without --privileged flag…",
        "Verifying privilege isolation…",
    ];
    if (ruleId === "5.10") return [
        "Inspecting containers with --network=host…",
        "Saving container configuration…",
        "Stopping container(s)…",
        "Removing old container(s)…",
        "Recreating with bridge network mode…",
        "Verifying network namespace isolation…",
    ];
    if (ruleId === "5.16") return [
        "Inspecting containers with --pid=host…",
        "Saving container configuration…",
        "Stopping container(s)…",
        "Removing old container(s)…",
        "Recreating with isolated PID namespace…",
        "Verifying PID namespace isolation…",
    ];
    if (ruleId === "5.17") return [
        "Inspecting containers with --ipc=host…",
        "Saving container configuration…",
        "Stopping container(s)…",
        "Removing old container(s)…",
        "Recreating with private IPC namespace…",
        "Verifying IPC namespace isolation…",
    ];
    if (ruleId === "5.18") return [
        "Inspecting direct host device mappings…",
        "Saving container or Compose configuration…",
        "Stopping affected container(s)…",
        "Recreating without direct host devices…",
        "Starting container(s)…",
        "Verifying device isolation…",
    ];
    if (ruleId === "5.21") return [
        "Inspecting containers with --uts=host…",
        "Saving container configuration…",
        "Stopping container(s)…",
        "Removing old container(s)…",
        "Recreating with isolated UTS namespace…",
        "Verifying UTS namespace isolation…",
    ];
    if (ruleId === "5.22") return [
        "Inspecting seccomp security options…",
        "Saving container or Compose configuration…",
        "Stopping affected container(s)…",
        "Recreating with seccomp enabled…",
        "Starting container(s)…",
        "Verifying seccomp profile…",
    ];
    if (ruleId === "5.31") return [
        "Inspecting containers with --userns=host…",
        "Saving container configuration…",
        "Stopping container(s)…",
        "Removing old container(s)…",
        "Recreating without --userns=host flag…",
        "Verifying user namespace isolation…",
    ];
    if (ruleId === "5.11") return [
        "Finding containers without memory limits…",
        "Applying selected Docker/Compose memory limit…",
        "Verifying memory cgroup limits…",
    ];
    if (ruleId === "5.12") return [
        "Finding containers without CPU shares…",
        "Applying selected Docker/Compose CPU shares…",
        "Verifying CPU cgroup shares…",
    ];
    if (ruleId === "5.29") return [
        "Finding containers without PIDs limits…",
        "Applying selected Docker/Compose PIDs limit…",
        "Verifying PIDs cgroup limits…",
    ];
    if (ruleId === "5.25") return [
        "Finding containers without cgroup limits…",
        "Applying selected Docker/Compose resource limits…",
        "Verifying cgroup confinement…",
    ];
    if (ruleId === "2.15") return [
        "Writing no-new-privileges to daemon.json…",
        "Restarting Docker daemon…",
        "Verifying daemon security options…",
    ];
    if (ruleId === "2.10") return [
        "Snapshotting container mounts and Compose context...",
        "Creating dockremap system user…",
        "Writing /etc/subuid and /etc/subgid…",
        "Mapping UID/GID ranges for dockremap…",
        "Writing userns-remap to daemon.json…",
        "Restarting Docker daemon…",
        "Migrating named volumes to the remapped Docker root...",
        "Fixing bind mount ownership...",
        "Restarting recovered containers...",
    ];
    if (ruleId.startsWith("1.1")) return [
        "Preflighting audit target…",
        "Writing audit rule to /etc/audit/rules.d/docker.rules…",
        "Reloading auditd service…",
        "Verifying persisted audit rule…",
    ];
    if (["3.1", "3.3", "3.5", "3.17"].includes(ruleId)) return [
        "Running chown root:root on target path…",
    ];
    if (["3.2", "3.4", "3.6", "3.18"].includes(ruleId)) return [
        "Running chmod on target path…",
    ];
    return ["Applying fix…"];
}

export function isNamespaceRecreateRule(ruleId: string): boolean {
    return ["5.4", "5.5", "5.10", "5.16", "5.17", "5.18", "5.21", "5.22", "5.31"].includes(ruleId);
}

export function isNamespaceIsolationRule(ruleId: string): boolean {
    return ["5.10", "5.16", "5.17", "5.21", "5.31"].includes(ruleId);
}

export function isRuntimeIsolationRule(ruleId: string): boolean {
    return ["5.4", "5.18", "5.22"].includes(ruleId);
}

export function isImageConfigRecreateRule(ruleId: string): boolean {
    return ["4.1", "4.6"].includes(ruleId);
}

export function isContainerRecreateRule(ruleId: string): boolean {
    return isNamespaceRecreateRule(ruleId) || isImageConfigRecreateRule(ruleId);
}

export function isCgroupRule(ruleId: string): boolean {
    return ["5.11", "5.12", "5.29"].includes(ruleId);
}

export type ResourceSuggestion = {
    memoryMb: number;
    cpuShares: number;
    pidsLimit: number;
};

export function getSuggestedLimits(name: string): ResourceSuggestion {
    const n = name.toLowerCase();
    if (n.includes("postgres") || n.includes("mysql") || n.includes("mariadb") || n.includes("pg"))
        return { memoryMb: 512, cpuShares: 1024, pidsLimit: 200 };
    if (n.includes("mongo"))
        return { memoryMb: 512, cpuShares: 1024, pidsLimit: 200 };
    if (n.includes("redis") || n.includes("memcached") || n.includes("cache"))
        return { memoryMb: 128, cpuShares: 512, pidsLimit: 100 };
    if (n.includes("node") || n.includes("next") || n.includes("nuxt") || n.includes("app"))
        return { memoryMb: 512, cpuShares: 1024, pidsLimit: 200 };
    if (n.includes("nginx") || n.includes("caddy") || n.includes("traefik") || n.includes("haproxy"))
        return { memoryMb: 256, cpuShares: 512, pidsLimit: 100 };
    return { memoryMb: 256, cpuShares: 512, pidsLimit: 100 };
}

export function formatCgroupSuggestion(ruleId: string, limits: ResourceSuggestion): string {
    if (ruleId === "5.11") return `${limits.memoryMb} MB`;
    if (ruleId === "5.12") return `${limits.cpuShares} shares`;
    if (ruleId === "5.29") return `${limits.pidsLimit} PIDs`;
    return "";
}

interface UseFixArgs {
    agentId: string;
    agentUrl: string;
    agentAccessMode?: string;
    token?: string;
    auditTimestamp?: string;
}

export type TargetConfig = {
    memoryMb: number;
    cpuShares: number;
    pidsLimit: number;
    strategy: "docker_update" | "compose_update" | "dokuru_override" | "dockerfile_update" | "recreate";
    user?: string;
};

function suggestedNonRootUser(user?: string) {
    return user && /^([1-9]\d*):(\d+)$/.test(user) ? user : "1000:1000";
}

function finalStepIndexFromJob(agentId: string, ruleId: string, fallback: number) {
    return useAuditStore.getState().fixJobs[fixJobKey(agentId, ruleId)]?.stepIndex ?? fallback;
}

function normalizePreviewStrategy(ruleId: string, strategy: string, canCompose: boolean): TargetConfig["strategy"] {
    if (strategy === "docker_update" || strategy === "compose_update" || strategy === "dokuru_override" || strategy === "dockerfile_update" || strategy === "recreate") {
        return strategy;
    }
    if (isImageConfigRecreateRule(ruleId) && !canCompose) return "recreate";
    if ((isNamespaceIsolationRule(ruleId) || isRuntimeIsolationRule(ruleId)) && !canCompose) return "recreate";
    return canCompose ? "dokuru_override" : "docker_update";
}

function isTimestampAfter(value?: string, reference?: string) {
    if (!value || !reference) return false;
    const valueTime = Date.parse(value);
    const referenceTime = Date.parse(reference);
    return Number.isFinite(valueTime) && Number.isFinite(referenceTime) && valueTime > referenceTime;
}

function isFixJobCurrentForAudit(job: FixJobState | undefined, auditTimestamp?: string) {
    if (!job) return false;
    if (job.status === "running" || !auditTimestamp) return true;
    return isTimestampAfter(job.completedAt ?? job.startedAt, auditTimestamp);
}

export function useFix({ agentId, agentUrl, agentAccessMode, token, auditTimestamp }: UseFixArgs) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<WizardStep>("confirm");
    const [outcome, setOutcome] = useState<FixOutcome | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [activeResult, setActiveResult] = useState<AuditResult | null>(null);
    const [preview, setPreview] = useState<FixPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [targetConfig, setTargetConfig] = useState<Record<string, TargetConfig>>({});
    const activeRuleId = activeResult?.rule.id;
    const activeJob = useAuditStore((state) => activeRuleId ? state.fixJobs[fixJobKey(agentId, activeRuleId)] : undefined);

    const startFixJob = useAuditStore((state) => state.startFixJob);
    const cancelFixJob = useAuditStore((state) => state.cancelFixJob);
    const queryClient = useQueryClient();

    const openWizard = useCallback((result: AuditResult) => {
        const state = useAuditStore.getState();
        const existingJob = state.fixJobs[fixJobKey(agentId, result.rule.id)];
        const existingOutcome = state.fixOutcomes[agentId]?.[result.rule.id];
        const existingJobIsCurrent = isFixJobCurrentForAudit(existingJob, auditTimestamp);
        setActiveResult(result);
        setPreview(null);
        setTargetConfig({});
        setOpen(true);

        if (existingJob && existingJobIsCurrent) {
            setStep(existingJob.status === "running" ? "applying" : "result");
            setOutcome(existingJob.outcome ?? null);
            setStepIndex(existingJob.stepIndex);
            setPreviewLoading(false);
            return;
        }

        if (existingOutcome && (!existingJob || existingJobIsCurrent)) {
            setStep("result");
            setOutcome(existingOutcome);
            setStepIndex(Number.MAX_SAFE_INTEGER);
            setPreviewLoading(false);
            return;
        }

        setStep("confirm");
        setOutcome(null);
        setStepIndex(0);
        setPreviewLoading(true);

        const loadPreview = agentAccessMode === "relay"
            ? agentApi.previewFix(agentId, result.rule.id)
            : agentDirectApi.previewFix(agentUrl, result.rule.id, token);

        loadPreview
            .then((nextPreview) => {
                setPreview(nextPreview);
                setTargetConfig(Object.fromEntries(nextPreview.targets.map((target) => [
                    target.container_id,
                    (() => {
                        const fallback = getSuggestedLimits(target.container_name);
                        return {
                            memoryMb: target.suggestion ? Math.round(target.suggestion.memory / 1024 / 1024) : fallback.memoryMb,
                            cpuShares: target.suggestion?.cpu_shares ?? fallback.cpuShares,
                            pidsLimit: target.suggestion?.pids_limit ?? fallback.pidsLimit,
                            strategy: normalizePreviewStrategy(result.rule.id, target.strategy, Boolean(target.compose_project && target.compose_service)),
                            user: result.rule.id === "4.1" ? suggestedNonRootUser(target.suggested_user) : undefined,
                        };
                    })(),
                ])));
            })
            .catch(() => toast.error(`Failed to load fix preview for rule ${result.rule.id}`))
            .finally(() => setPreviewLoading(false));
    }, [agentAccessMode, agentId, agentUrl, auditTimestamp, token]);

    const updateTargetConfig = useCallback((containerId: string, patch: Partial<TargetConfig>) => {
        setTargetConfig((current) => ({
            ...current,
            [containerId]: { ...current[containerId], ...patch },
        }));
    }, []);

    const closeWizard = useCallback(() => {
        setOpen(false);
        setTimeout(() => {
            setStep("confirm");
            setOutcome(null);
            setStepIndex(0);
            setPreview(null);
            setTargetConfig({});
        }, 300);
    }, []);

    const buildTargets = useCallback((ruleId: string): FixTarget[] => {
        if (!preview) return [];
        return preview.targets.map((target) => {
            const config = targetConfig[target.container_id];
            const strategy = config?.strategy ?? normalizePreviewStrategy(ruleId, target.strategy, Boolean(target.compose_project && target.compose_service));
            const base: FixTarget = {
                container_id: target.container_id,
                strategy,
            };
            if (ruleId === "5.11") base.memory = Math.max(1, config?.memoryMb ?? 256) * 1024 * 1024;
            if (ruleId === "5.12") base.cpu_shares = Math.max(2, config?.cpuShares ?? 512);
            if (ruleId === "5.29") base.pids_limit = Math.max(1, config?.pidsLimit ?? 100);
            if (ruleId === "5.25") {
                const fallback = getSuggestedLimits(target.container_name || target.image);
                base.memory = (config?.memoryMb ?? fallback.memoryMb) * 1024 * 1024;
                base.cpu_shares = config?.cpuShares ?? fallback.cpuShares;
                base.pids_limit = config?.pidsLimit ?? fallback.pidsLimit;
            }
            if (ruleId === "4.1") base.user = suggestedNonRootUser(config?.user ?? target.suggested_user);
            return base;
        });
    }, [preview, targetConfig]);

    const applyFix = useCallback(async () => {
        if (!activeResult) return;
        const { rule } = activeResult;
        const steps = getFixSteps(rule.id);
        const targets = buildTargets(rule.id);

        setStep("applying");
        setStepIndex(0);

        try {
            const fixOutcome = await startFixJob({
                agentId,
                agentUrl,
                agentAccessMode,
                token,
                ruleId: rule.id,
                targets,
            });
            setStepIndex(finalStepIndexFromJob(agentId, rule.id, fixOutcome.status === "Applied" ? steps.length : 0));
            setOutcome(fixOutcome);
            setStep("result");
            await queryClient.invalidateQueries({ queryKey: ["fix-history"] });

            if (fixOutcome.status === "Applied") {
                if (shouldShowRouteFixToast(agentId)) {
                    toast.success(`Fix applied - rule ${rule.id}`);
                }
                await queryClient.invalidateQueries({ queryKey: ["agent-audit"] });
            } else if (fixOutcome.status === "Blocked") {
                if (shouldShowRouteFixToast(agentId)) {
                    toast.error(`${rule.id}: ${fixOutcome.message.slice(0, 80)}`);
                }
            }
        } catch (error) {
            const errOutcome: FixOutcome = {
                rule_id: rule.id,
                status: "Blocked",
                message: error instanceof Error ? error.message : "Failed to stream fix progress from agent",
                requires_restart: false,
                requires_elevation: false,
            };
            setStepIndex(finalStepIndexFromJob(agentId, rule.id, 0));
            setOutcome(errOutcome);
            setStep("result");
            if (shouldShowRouteFixToast(agentId)) {
                toast.error(errOutcome.message === FIX_CANCELLED_MESSAGE ? "Fix cancelled" : "Fix failed");
            }
        }
    }, [activeResult, agentAccessMode, agentId, agentUrl, buildTargets, queryClient, startFixJob, token]);

    const cancelFix = useCallback(() => {
        if (!activeResult) return;
        cancelFixJob(agentId, activeResult.rule.id);
    }, [activeResult, agentId, cancelFixJob]);

    const effectiveStep = activeJob
        ? activeJob.status === "running" ? "applying" : "result"
        : step;
    const effectiveOutcome = activeJob?.outcome ?? outcome;
    const effectiveStepIndex = activeJob?.stepIndex ?? stepIndex;
    const effectiveProgressEvents = activeJob?.progressEvents ?? [];

    return {
        open,
        step: effectiveStep,
        outcome: effectiveOutcome,
        stepIndex: effectiveStepIndex,
        activeResult,
        preview,
        previewLoading,
        targetConfig,
        progressEvents: effectiveProgressEvents,
        updateTargetConfig,
        openWizard,
        closeWizard,
        applyFix,
        cancelFix,
    };
}
