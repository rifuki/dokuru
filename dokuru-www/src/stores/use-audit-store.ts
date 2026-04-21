import { create } from "zustand";
import type { AuditResponse, FixOutcome } from "@/lib/api/agent-direct";

interface AuditState {
    // Audit sedang berjalan per agentId
    runningAudits: Record<string, boolean>;

    // Cache history per agentId
    auditHistories: Record<string, AuditResponse[]>;

    // Rule yang sedang di-fix: agentId -> ruleId -> boolean
    fixingRules: Record<string, Record<string, boolean>>;

    // Hasil fix: agentId -> ruleId -> FixOutcome | null
    fixOutcomes: Record<string, Record<string, FixOutcome | null>>;

    // Actions
    setRunning: (agentId: string, running: boolean) => void;
    setAuditHistory: (agentId: string, history: AuditResponse[]) => void;
    setFixing: (agentId: string, ruleId: string, fixing: boolean) => void;
    setFixOutcome: (agentId: string, ruleId: string, outcome: FixOutcome | null) => void;
}

export const useAuditStore = create<AuditState>((set) => ({
    runningAudits: {},
    auditHistories: {},
    fixingRules: {},
    fixOutcomes: {},

    setRunning: (agentId, running) =>
        set((s) => ({
            runningAudits: { ...s.runningAudits, [agentId]: running },
        })),

    setAuditHistory: (agentId, history) =>
        set((s) => ({
            auditHistories: { ...s.auditHistories, [agentId]: history },
        })),

    setFixing: (agentId, ruleId, fixing) =>
        set((s) => ({
            fixingRules: {
                ...s.fixingRules,
                [agentId]: { ...s.fixingRules[agentId], [ruleId]: fixing },
            },
        })),

    setFixOutcome: (agentId, ruleId, outcome) =>
        set((s) => ({
            fixOutcomes: {
                ...s.fixOutcomes,
                [agentId]: { ...s.fixOutcomes[agentId], [ruleId]: outcome },
            },
        })),
}));
