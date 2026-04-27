import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResult, type FixOutcome } from "@/lib/api/agent-direct";

export type FixAllStep = "confirm" | "applying" | "result";

export type RuleFixStatus = {
    ruleId: string;
    title: string;
    outcome: FixOutcome | null;
    state: "pending" | "applying" | "done" | "skipped";
    selected: boolean;
    highRisk: boolean;
};

const HIGH_RISK_AUTO_FIX_RULES = new Set(["2.10", "5.5", "5.10", "5.16", "5.17", "5.21", "5.31"]);

interface UseFixAllArgs {
    agentId: string;
    agentUrl: string;
    agentAccessMode?: string;
    token?: string;
}

type FixStreamMessage =
    | { type: "progress"; data: unknown }
    | { type: "outcome"; data: FixOutcome }
    | { type: "error"; message: string };

export function useFixAll({ agentId, agentUrl, agentAccessMode, token }: UseFixAllArgs) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<FixAllStep>("confirm");
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [ruleStatuses, setRuleStatuses] = useState<RuleFixStatus[]>([]);

    const queryClient = useQueryClient();

    const applyRuleViaStream = useCallback((ruleId: string) => new Promise<FixOutcome>((resolve, reject) => {
        const request = { rule_id: ruleId, targets: [] };
        const url = agentAccessMode === "relay"
            ? agentApi.fixStreamUrl(agentId, request)
            : agentDirectApi.fixStreamUrl(agentUrl, request, token);
        const socket = new WebSocket(url);
        let settled = false;

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(String(event.data)) as FixStreamMessage;
                if (message.type === "outcome") {
                    settled = true;
                    resolve(message.data);
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
            if (!settled) {
                settled = true;
                reject(new Error("Fix progress stream closed before completion"));
            }
        };
    }), [agentAccessMode, agentId, agentUrl, token]);

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

    const closeFixAll = useCallback(() => {
        setOpen(false);
        setTimeout(() => {
            setStep("confirm");
            setCurrentIndex(-1);
            setRuleStatuses([]);
        }, 300);
    }, []);

    const applyAll = useCallback(async () => {
        const selectedTotal = ruleStatuses.filter(r => r.selected).length;
        if (selectedTotal === 0) {
            toast.error("Select at least one rule to fix");
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
                updated[i].outcome = await applyRuleViaStream(updated[i].ruleId);
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
    }, [ruleStatuses, applyRuleViaStream, queryClient]);

    const selectedCount = ruleStatuses.filter(r => r.selected).length;

    return {
        open,
        step,
        currentIndex,
        ruleStatuses,
        selectedCount,
        openFixAll,
        closeFixAll,
        applyAll,
        toggleRule,
        setAllSelected,
    };
}
