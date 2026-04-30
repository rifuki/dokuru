import { create } from "zustand";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResponse, type AuditResult, type AuditStreamMessage, type FixOutcome } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";

export type AuditStreamStatus = "idle" | "running" | "saving" | "complete" | "error";

export interface AuditProgressLine {
    index: number;
    total: number;
    ruleId: string;
    title: string;
    status: AuditResult["status"];
    message: string;
    command?: string;
    timestamp: string;
}

export interface AuditStreamState {
    status: AuditStreamStatus;
    total: number;
    current: number;
    lines: AuditProgressLine[];
    error: string | null;
    savedAudit?: AuditResponse;
    startedAt?: string;
    completedAt?: string;
}

const auditSockets = new Map<string, WebSocket>();
const auditRuns = new Map<string, Promise<AuditResponse>>();

const createIdleStream = (): AuditStreamState => ({
    status: "idle",
    total: 0,
    current: 0,
    lines: [],
    error: null,
});

interface AuditState {
    // Audit sedang berjalan per agentId
    runningAudits: Record<string, boolean>;

    // Cache history per agentId
    auditHistories: Record<string, AuditResponse[]>;

    // Rule yang sedang di-fix: agentId -> ruleId -> boolean
    fixingRules: Record<string, Record<string, boolean>>;

    // Hasil fix: agentId -> ruleId -> FixOutcome | null
    fixOutcomes: Record<string, Record<string, FixOutcome | null>>;

    // Progress audit stream per agentId. The websocket itself is module-scoped,
    // so the scan keeps running when the audit route unmounts.
    auditStreams: Record<string, AuditStreamState>;

    // Actions
    setRunning: (agentId: string, running: boolean) => void;
    setAuditHistory: (agentId: string, history: AuditResponse[]) => void;
    setFixing: (agentId: string, ruleId: string, fixing: boolean) => void;
    setFixOutcome: (agentId: string, ruleId: string, outcome: FixOutcome | null) => void;
    startAudit: (agent: Agent, token?: string) => Promise<AuditResponse>;
}

export const useAuditStore = create<AuditState>((set) => ({
    runningAudits: {},
    auditHistories: {},
    fixingRules: {},
    fixOutcomes: {},
    auditStreams: {},

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

    startAudit: (agent, token) => {
        const existingRun = auditRuns.get(agent.id);
        if (existingRun) return existingRun;

        if (agent.access_mode !== "relay" && !token) {
            return Promise.reject(new Error("Agent token not found. Edit this agent and paste the token once to sync it across devices."));
        }

        const url = agent.access_mode === "relay"
            ? agentApi.auditStreamUrl(agent.id)
            : agentDirectApi.auditStreamUrl(agent.url, token);

        set((s) => ({
            runningAudits: { ...s.runningAudits, [agent.id]: true },
            auditStreams: {
                ...s.auditStreams,
                [agent.id]: {
                    ...createIdleStream(),
                    status: "running",
                    startedAt: new Date().toISOString(),
                },
            },
        }));

        const run = new Promise<AuditResponse>((resolve, reject) => {
            const socket = new WebSocket(url);
            auditSockets.set(agent.id, socket);
            let settled = false;

            const setStream = (update: Partial<AuditStreamState>) => {
                set((s) => ({
                    auditStreams: {
                        ...s.auditStreams,
                        [agent.id]: {
                            ...(s.auditStreams[agent.id] ?? createIdleStream()),
                            ...update,
                        },
                    },
                }));
            };

            const finishWithError = (message: string) => {
                if (settled) return;
                settled = true;
                socket.close();
                if (auditSockets.get(agent.id) === socket) auditSockets.delete(agent.id);
                auditRuns.delete(agent.id);
                set((s) => ({
                    runningAudits: { ...s.runningAudits, [agent.id]: false },
                    auditStreams: {
                        ...s.auditStreams,
                        [agent.id]: {
                            ...(s.auditStreams[agent.id] ?? createIdleStream()),
                            status: "error",
                            error: message,
                            completedAt: new Date().toISOString(),
                        },
                    },
                }));
                reject(new Error(message));
            };

            const finishWithAudit = async (audit: AuditResponse) => {
                if (settled) return;
                settled = true;
                socket.close();
                setStream({ status: "saving" });

                try {
                    const savedAudit = await agentApi.saveAudit(agent.id, audit);
                    auditRuns.delete(agent.id);
                    if (auditSockets.get(agent.id) === socket) auditSockets.delete(agent.id);
                    set((s) => ({
                        runningAudits: { ...s.runningAudits, [agent.id]: false },
                        auditHistories: {
                            ...s.auditHistories,
                            [agent.id]: [
                                savedAudit,
                                ...(s.auditHistories[agent.id] ?? []).filter((item) => item.id !== savedAudit.id),
                            ],
                        },
                        auditStreams: {
                            ...s.auditStreams,
                            [agent.id]: {
                                ...(s.auditStreams[agent.id] ?? createIdleStream()),
                                status: "complete",
                                current: (s.auditStreams[agent.id]?.total ?? 0) || s.auditStreams[agent.id]?.current || 0,
                                error: null,
                                savedAudit,
                                completedAt: new Date().toISOString(),
                            },
                        },
                    }));
                    resolve(savedAudit);
                } catch (error) {
                    auditRuns.delete(agent.id);
                    if (auditSockets.get(agent.id) === socket) auditSockets.delete(agent.id);
                    const message = error instanceof Error ? error.message : "Failed to save audit result";
                    set((s) => ({
                        runningAudits: { ...s.runningAudits, [agent.id]: false },
                        auditStreams: {
                            ...s.auditStreams,
                            [agent.id]: {
                                ...(s.auditStreams[agent.id] ?? createIdleStream()),
                                status: "error",
                                error: message,
                                completedAt: new Date().toISOString(),
                            },
                        },
                    }));
                    reject(error instanceof Error ? error : new Error(message));
                }
            };

            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(String(event.data)) as AuditStreamMessage;
                    if (message.type === "started") {
                        setStream({ total: message.total, current: 0, error: null });
                        return;
                    }

                    if (message.type === "progress") {
                        set((s) => {
                            const current = s.auditStreams[agent.id] ?? createIdleStream();
                            return {
                                auditStreams: {
                                    ...s.auditStreams,
                                    [agent.id]: {
                                        ...current,
                                        total: message.total,
                                        current: message.index,
                                        error: null,
                                        lines: [...current.lines, {
                                            index: message.index,
                                            total: message.total,
                                            ruleId: message.data.rule.id,
                                            title: message.data.rule.title,
                                            status: message.data.status,
                                            message: message.data.message,
                                            command: message.data.audit_command,
                                            timestamp: new Date().toISOString(),
                                        }],
                                    },
                                },
                            };
                        });
                        return;
                    }

                    if (message.type === "complete") {
                        void finishWithAudit(message.data);
                        return;
                    }

                    if (message.type === "error") {
                        finishWithError(message.message);
                    }
                } catch (error) {
                    finishWithError(error instanceof Error ? error.message : "Invalid audit stream message");
                }
            };

            socket.onerror = () => finishWithError("Audit progress stream failed");
            socket.onclose = () => {
                if (auditSockets.get(agent.id) === socket) auditSockets.delete(agent.id);
                if (!settled) finishWithError("Audit progress stream closed before completion");
            };
        });

        auditRuns.set(agent.id, run);
        return run;
    },
}));
