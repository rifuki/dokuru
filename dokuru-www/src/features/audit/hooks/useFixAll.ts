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
    state: "pending" | "applying" | "done";
};

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

    const queryClient = useQueryClient();

    const openFixAll = useCallback((rules: AuditResult[]) => {
        setRuleStatuses(rules.map(r => ({
            ruleId: r.rule.id,
            title: r.rule.title,
            outcome: null,
            state: "pending",
        })));
        setStep("confirm");
        setCurrentIndex(-1);
        setOpen(true);
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
        setStep("applying");
        const updated = ruleStatuses.map(r => ({ ...r }));

        for (let i = 0; i < updated.length; i++) {
            setCurrentIndex(i);
            updated[i].state = "applying";
            setRuleStatuses([...updated]);

            try {
                let outcome: FixOutcome;
                if (agentAccessMode === "relay") {
                    const res = await agentApi.applyFix(agentId, updated[i].ruleId);
                    outcome = res.outcome;
                } else {
                    outcome = await agentDirectApi.applyFix(agentUrl, updated[i].ruleId, token);
                }
                updated[i].outcome = outcome;
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
        }

        setCurrentIndex(updated.length);
        setStep("result");

        const applied = updated.filter(r => r.outcome?.status === "Applied").length;
        const blocked = updated.filter(r => r.outcome?.status === "Blocked").length;

        if (applied > 0) {
            toast.success(`Applied ${applied} fix${applied > 1 ? "es" : ""}${blocked > 0 ? `, ${blocked} blocked` : ""}`);
            await queryClient.invalidateQueries({ queryKey: ["agent-audit"] });
        } else {
            toast.error("No fixes could be applied");
        }
    }, [ruleStatuses, agentId, agentUrl, agentAccessMode, token, queryClient]);

    return { open, step, currentIndex, ruleStatuses, openFixAll, closeFixAll, applyAll };
}
