import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResult, type FixOutcome, type FixPreview, type FixProgress, type FixTarget } from "@/lib/api/agent-direct";
import { useAuditStore } from "@/stores/use-audit-store";

export type WizardStep = "confirm" | "applying" | "result";

export function getFixSteps(ruleId: string): string[] {
    if (ruleId === "1.1.1") return [
        "Preflighting Docker root and host storage…",
        "Selecting an unambiguous LVM volume group…",
        "Creating a dedicated Docker logical volume…",
        "Formatting and mounting the new volume temporarily…",
        "Copying Docker root data into the new volume…",
        "Stopping Docker services for final sync…",
        "Switching DockerRootDir to the dedicated mount…",
        "Persisting the mount in /etc/fstab…",
        "Restarting Docker and verifying the mount point…",
    ];
    if (ruleId === "4.1") return [
        "Finding containers running as root…",
        "Saving container or Compose configuration…",
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
    if (ruleId === "5.21") return [
        "Inspecting containers with --uts=host…",
        "Saving container configuration…",
        "Stopping container(s)…",
        "Removing old container(s)…",
        "Recreating with isolated UTS namespace…",
        "Verifying UTS namespace isolation…",
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
    return ["5.5", "5.10", "5.16", "5.17", "5.21", "5.31"].includes(ruleId);
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
}

export type TargetConfig = {
    memoryMb: number;
    cpuShares: number;
    pidsLimit: number;
    strategy: "docker_update" | "compose_update";
};

type FixStreamMessage =
    | { type: "progress"; data: FixProgress }
    | { type: "outcome"; data: FixOutcome }
    | { type: "error"; message: string };

type FixStreamResult = {
    outcome: FixOutcome;
    events: FixProgress[];
};

export function useFix({ agentId, agentUrl, agentAccessMode, token }: UseFixArgs) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<WizardStep>("confirm");
    const [outcome, setOutcome] = useState<FixOutcome | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [activeResult, setActiveResult] = useState<AuditResult | null>(null);
    const [preview, setPreview] = useState<FixPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [targetConfig, setTargetConfig] = useState<Record<string, TargetConfig>>({});
    const [progressEvents, setProgressEvents] = useState<FixProgress[]>([]);
    const socketRef = useRef<WebSocket | null>(null);

    const { setFixing, setFixOutcome } = useAuditStore();
    const queryClient = useQueryClient();

    const openWizard = useCallback((result: AuditResult) => {
        setActiveResult(result);
        setStep("confirm");
        setOutcome(null);
        setStepIndex(0);
        setProgressEvents([]);
        setPreview(null);
        setTargetConfig({});
        setOpen(true);
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
                            strategy: target.strategy === "compose_update" ? "compose_update" : "docker_update",
                        };
                    })(),
                ])));
            })
            .catch(() => toast.error(`Failed to load fix preview for rule ${result.rule.id}`))
            .finally(() => setPreviewLoading(false));
    }, [agentAccessMode, agentId, agentUrl, token]);

    const updateTargetConfig = useCallback((containerId: string, patch: Partial<TargetConfig>) => {
        setTargetConfig((current) => ({
            ...current,
            [containerId]: { ...current[containerId], ...patch },
        }));
    }, []);

    const closeWizard = useCallback(() => {
        socketRef.current?.close();
        socketRef.current = null;
        setOpen(false);
        setTimeout(() => {
            setStep("confirm");
            setOutcome(null);
            setStepIndex(0);
            setPreview(null);
            setTargetConfig({});
            setProgressEvents([]);
        }, 300);
    }, []);

    const buildTargets = useCallback((ruleId: string): FixTarget[] => {
        if (!preview) return [];
        return preview.targets.map((target) => {
            const config = targetConfig[target.container_id];
            const base: FixTarget = {
                container_id: target.container_id,
                strategy: config?.strategy ?? target.strategy,
            };
            if (ruleId === "5.11") base.memory = Math.max(1, config?.memoryMb ?? 256) * 1024 * 1024;
            if (ruleId === "5.12") base.cpu_shares = Math.max(2, config?.cpuShares ?? 512);
            if (ruleId === "5.29") base.pids_limit = Math.max(1, config?.pidsLimit ?? 100);
            return base;
        });
    }, [preview, targetConfig]);

    const applyFixViaStream = useCallback((ruleId: string, targets: FixTarget[]) => new Promise<FixStreamResult>((resolve, reject) => {
        const request = { rule_id: ruleId, targets };
        const url = agentAccessMode === "relay"
            ? agentApi.fixStreamUrl(agentId, request)
            : agentDirectApi.fixStreamUrl(agentUrl, request, token);
        const socket = new WebSocket(url);
        let settled = false;
        const streamEvents: FixProgress[] = [];
        socketRef.current = socket;

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(String(event.data)) as FixStreamMessage;
                if (message.type === "progress") {
                    streamEvents.push(message.data);
                    setProgressEvents((events) => [...events, message.data]);
                    setStepIndex(Math.max(0, message.data.step - 1));
                    return;
                }
                if (message.type === "outcome") {
                    settled = true;
                    if (message.data.status === "Applied" && streamEvents.length === 0) {
                        reject(new Error("Agent returned success without live command/evidence output"));
                        socket.close();
                        return;
                    }
                    resolve({ outcome: message.data, events: streamEvents });
                    socket.close();
                    return;
                }
                if (message.type === "error") {
                    settled = true;
                    reject(new Error(message.message));
                    socket.close();
                }
            } catch (error) {
                settled = true;
                reject(error instanceof Error ? error : new Error("Invalid fix stream message"));
                socket.close();
            }
        };

        socket.onerror = () => {
            if (!settled) {
                settled = true;
                reject(new Error("Fix progress stream failed"));
            }
        };
        socket.onclose = () => {
            if (socketRef.current === socket) socketRef.current = null;
            if (!settled) {
                settled = true;
                const lastEvent = streamEvents.at(-1);
                reject(new Error(
                    lastEvent
                        ? `Fix progress stream closed before final outcome. Last event: ${lastEvent.action} (${lastEvent.status})`
                        : "Fix progress stream closed before completion",
                ));
            }
        };
    }), [agentAccessMode, agentId, agentUrl, token]);

    const applyFix = useCallback(async () => {
        if (!activeResult) return;
        const { rule } = activeResult;
        const steps = getFixSteps(rule.id);
        const targets = buildTargets(rule.id);

        setStep("applying");
        setStepIndex(0);
        setProgressEvents([]);
        setFixing(agentId, rule.id, true);
        setFixOutcome(agentId, rule.id, null);

        try {
            const { outcome: fixOutcome } = await applyFixViaStream(rule.id, targets);
            setStepIndex(steps.length);
            setOutcome(fixOutcome);
            setFixOutcome(agentId, rule.id, fixOutcome);
            setStep("result");

            if (fixOutcome.status === "Applied") {
                toast.success(`Fix applied — rule ${rule.id}`);
                await queryClient.invalidateQueries({ queryKey: ["agent-audit"] });
            } else if (fixOutcome.status === "Blocked") {
                toast.error(`${rule.id}: ${fixOutcome.message.slice(0, 80)}`);
            }
        } catch (error) {
            const errOutcome: FixOutcome = {
                rule_id: rule.id,
                status: "Blocked",
                message: error instanceof Error ? error.message : "Failed to stream fix progress from agent",
                requires_restart: false,
                requires_elevation: false,
            };
            setStepIndex(steps.length);
            setOutcome(errOutcome);
            setFixOutcome(agentId, rule.id, errOutcome);
            setStep("result");
            toast.error("Fix failed");
        } finally {
            setFixing(agentId, rule.id, false);
        }
    }, [activeResult, agentId, buildTargets, applyFixViaStream, queryClient, setFixing, setFixOutcome]);

    return {
        open,
        step,
        outcome,
        stepIndex,
        activeResult,
        preview,
        previewLoading,
        targetConfig,
        progressEvents,
        updateTargetConfig,
        openWizard,
        closeWizard,
        applyFix,
    };
}
