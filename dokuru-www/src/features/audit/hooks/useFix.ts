import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResult, type FixOutcome } from "@/lib/api/agent-direct";
import { useAuditStore } from "@/stores/use-audit-store";

export type WizardStep = "confirm" | "applying" | "result";

export function getFixSteps(ruleId: string): string[] {
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
        "Applying docker update --memory=256m…",
        "Verifying memory cgroup limits…",
    ];
    if (ruleId === "5.12") return [
        "Finding containers without CPU shares…",
        "Applying docker update --cpu-shares=512…",
        "Verifying CPU cgroup shares…",
    ];
    if (ruleId === "5.29") return [
        "Finding containers without PIDs limits…",
        "Applying docker update --pids-limit=100…",
        "Verifying PIDs cgroup limits…",
    ];
    if (ruleId === "2.10") return [
        "Creating dockremap system user…",
        "Writing /etc/subuid and /etc/subgid…",
        "Mapping UID/GID ranges for dockremap…",
        "Writing userns-remap to daemon.json…",
        "Restarting Docker daemon…",
    ];
    if (ruleId.startsWith("1.1")) return [
        "Writing audit rule to /etc/audit/rules.d/docker.rules…",
        "Reloading auditd service…",
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

export function useFix({ agentId, agentUrl, agentAccessMode, token }: UseFixArgs) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<WizardStep>("confirm");
    const [outcome, setOutcome] = useState<FixOutcome | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [activeResult, setActiveResult] = useState<AuditResult | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { setFixing, setFixOutcome } = useAuditStore();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const openWizard = useCallback((result: AuditResult) => {
        setActiveResult(result);
        setStep("confirm");
        setOutcome(null);
        setStepIndex(0);
        setOpen(true);
    }, []);

    const closeWizard = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setOpen(false);
        setTimeout(() => {
            setStep("confirm");
            setOutcome(null);
            setStepIndex(0);
        }, 300);
    }, []);

    const applyFix = useCallback(async () => {
        if (!activeResult) return;
        const { rule } = activeResult;
        const steps = getFixSteps(rule.id);

        setStep("applying");
        setStepIndex(0);
        setFixing(agentId, rule.id, true);
        setFixOutcome(agentId, rule.id, null);

        let idx = 0;
        intervalRef.current = setInterval(() => {
            idx++;
            if (idx < steps.length) setStepIndex(idx);
            else if (intervalRef.current) clearInterval(intervalRef.current);
        }, 1400);

        try {
            let fixOutcome: FixOutcome;

            if (agentAccessMode === "relay") {
                const res = await agentApi.applyFix(agentId, rule.id);
                fixOutcome = res.outcome;
                if (intervalRef.current) clearInterval(intervalRef.current);
                setStepIndex(steps.length);
                setOutcome(fixOutcome);
                setFixOutcome(agentId, rule.id, fixOutcome);
                setStep("result");

                if (fixOutcome.status === "Applied") {
                    toast.success(`Fix applied — rule ${rule.id}`);
                    await queryClient.invalidateQueries({ queryKey: ["agent-audit"] });
                    if (res.audit?.id) {
                        closeWizard();
                        navigate({
                            to: "/agents/$id/audits/$auditId",
                            params: { id: agentId, auditId: res.audit.id },
                        });
                    }
                } else if (fixOutcome.status === "Blocked") {
                    toast.error(`${rule.id}: ${fixOutcome.message.slice(0, 80)}`);
                }
            } else {
                fixOutcome = await agentDirectApi.applyFix(agentUrl, rule.id, token);
                if (intervalRef.current) clearInterval(intervalRef.current);
                setStepIndex(steps.length);
                setOutcome(fixOutcome);
                setFixOutcome(agentId, rule.id, fixOutcome);
                setStep("result");

                if (fixOutcome.status === "Applied") {
                    toast.success(`Fix applied — rule ${rule.id}`);
                    await queryClient.invalidateQueries({ queryKey: ["agent-audit"] });
                    setTimeout(() => setFixOutcome(agentId, rule.id, null), 3000);
                } else if (fixOutcome.status === "Blocked") {
                    toast.error(`${rule.id}: ${fixOutcome.message.slice(0, 80)}`);
                }
            }
        } catch {
            if (intervalRef.current) clearInterval(intervalRef.current);
            const errOutcome: FixOutcome = {
                rule_id: rule.id,
                status: "Blocked",
                message: agentAccessMode === "relay"
                    ? "Failed to apply relay fix — check agent connectivity"
                    : "Failed to connect to agent — verify URL and token",
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
    }, [activeResult, agentId, agentUrl, agentAccessMode, token, queryClient, navigate, closeWizard, setFixing, setFixOutcome]);

    return { open, step, outcome, stepIndex, activeResult, openWizard, closeWizard, applyFix };
}
