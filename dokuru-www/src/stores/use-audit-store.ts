import { create } from "zustand";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResponse, type AuditResult, type AuditStreamMessage, type FixOutcome, type FixProgress, type FixTarget } from "@/lib/api/agent-direct";
import { LOCAL_AGENT_ID } from "@/lib/local-agent";
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

export type FixJobStatus = "running" | "applied" | "blocked" | "failed";

export interface FixJobState {
    agentId: string;
    ruleId: string;
    status: FixJobStatus;
    progressEvents: FixProgress[];
    stepIndex: number;
    outcome?: FixOutcome;
    error?: string;
    startedAt: string;
    completedAt?: string;
}

export interface StartFixJobRequest {
    agentId: string;
    agentUrl: string;
    agentAccessMode?: string;
    token?: string;
    ruleId: string;
    targets: FixTarget[];
}

type FixStreamMessage =
    | { type: "progress"; data: FixProgress }
    | { type: "outcome"; data: FixOutcome }
    | { type: "error"; message: string };

export function fixJobKey(agentId: string, ruleId: string) {
    return `${agentId}:${ruleId}`;
}

const auditSockets = new Map<string, WebSocket>();
const auditRuns = new Map<string, Promise<AuditResponse>>();
const fixSockets = new Map<string, WebSocket>();
const fixRuns = new Map<string, Promise<FixOutcome>>();

const createIdleStream = (): AuditStreamState => ({
    status: "idle",
    total: 0,
    current: 0,
    lines: [],
    error: null,
});

function allowsTokenlessLocalAgent(agentId: string) {
    return agentId === LOCAL_AGENT_ID;
}

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

    // Last completed audit result the user already opened per agentId.
    viewedAuditResults: Record<string, string>;

    // Background fix jobs keyed by agentId:ruleId. The websocket is module-scoped,
    // so remediation keeps running when the sheet or route unmounts.
    fixJobs: Record<string, FixJobState>;

    // Actions
    setRunning: (agentId: string, running: boolean) => void;
    setAuditHistory: (agentId: string, history: AuditResponse[]) => void;
    setFixing: (agentId: string, ruleId: string, fixing: boolean) => void;
    setFixOutcome: (agentId: string, ruleId: string, outcome: FixOutcome | null) => void;
    markAuditResultViewed: (agentId: string, auditId: string) => void;
    startAudit: (agent: Agent, token?: string) => Promise<AuditResponse>;
    startFixJob: (request: StartFixJobRequest) => Promise<FixOutcome>;
}

export const useAuditStore = create<AuditState>((set) => ({
    runningAudits: {},
    auditHistories: {},
    fixingRules: {},
    fixOutcomes: {},
    auditStreams: {},
    viewedAuditResults: {},
    fixJobs: {},

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

    markAuditResultViewed: (agentId, auditId) =>
        set((s) => ({
            viewedAuditResults: { ...s.viewedAuditResults, [agentId]: auditId },
        })),

    startAudit: (agent, token) => {
        const existingRun = auditRuns.get(agent.id);
        if (existingRun) return existingRun;

        if (agent.access_mode !== "relay" && !token && !allowsTokenlessLocalAgent(agent.id)) {
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
            let latestIndex = 0;
            let latestTotal = 0;

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

            const recoverCompletedStream = async () => {
                if (settled) return;
                settled = true;
                setStream({ status: "saving" });

                try {
                    const savedAudit = agent.access_mode === "relay"
                        ? await agentApi.runAudit(agent.id)
                        : await agentApi.saveAudit(agent.id, await agentDirectApi.runAudit(agent.url, token));
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
                                current: latestTotal || latestIndex,
                                total: latestTotal,
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
                    const message = error instanceof Error
                        ? `Audit stream reached ${latestIndex}/${latestTotal}, but final report recovery failed: ${error.message}`
                        : "Audit stream reached completion, but final report recovery failed";
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
                        latestIndex = message.index;
                        latestTotal = message.total;
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
                if (!settled) {
                    if (latestTotal > 0 && latestIndex >= latestTotal) {
                        void recoverCompletedStream();
                    } else {
                        finishWithError("Audit progress stream closed before completion");
                    }
                }
            };
        });

        auditRuns.set(agent.id, run);
        return run;
    },

    startFixJob: (request) => {
        const key = fixJobKey(request.agentId, request.ruleId);
        const existingRun = fixRuns.get(key);
        if (existingRun) return existingRun;

        if (request.agentAccessMode !== "relay" && !request.token && !allowsTokenlessLocalAgent(request.agentId)) {
            return Promise.reject(new Error("Agent token not found. Edit this agent and paste the token once to sync it across devices."));
        }

        const startedAt = new Date().toISOString();
        set((s) => ({
            fixingRules: {
                ...s.fixingRules,
                [request.agentId]: { ...s.fixingRules[request.agentId], [request.ruleId]: true },
            },
            fixOutcomes: {
                ...s.fixOutcomes,
                [request.agentId]: { ...s.fixOutcomes[request.agentId], [request.ruleId]: null },
            },
            fixJobs: {
                ...s.fixJobs,
                [key]: {
                    agentId: request.agentId,
                    ruleId: request.ruleId,
                    status: "running",
                    progressEvents: [],
                    stepIndex: 0,
                    startedAt,
                },
            },
        }));

        const run = new Promise<FixOutcome>((resolve, reject) => {
            const payload = { rule_id: request.ruleId, targets: request.targets };
            const url = request.agentAccessMode === "relay"
                ? agentApi.fixStreamUrl(request.agentId, payload)
                : agentDirectApi.fixStreamUrl(request.agentUrl, payload, request.token);
            const socket = new WebSocket(url);
            const streamEvents: FixProgress[] = [];
            let settled = false;
            fixSockets.set(key, socket);

            const completeJob = (outcome: FixOutcome) => {
                if (settled) return;
                settled = true;
                fixRuns.delete(key);
                if (fixSockets.get(key) === socket) fixSockets.delete(key);
                const status: FixJobStatus = outcome.status === "Applied"
                    ? "applied"
                    : outcome.status === "Blocked"
                    ? "blocked"
                    : "failed";
                set((s) => ({
                    fixingRules: {
                        ...s.fixingRules,
                        [request.agentId]: { ...s.fixingRules[request.agentId], [request.ruleId]: false },
                    },
                    fixOutcomes: {
                        ...s.fixOutcomes,
                        [request.agentId]: { ...s.fixOutcomes[request.agentId], [request.ruleId]: outcome },
                    },
                    fixJobs: {
                        ...s.fixJobs,
                        [key]: {
                            ...(s.fixJobs[key] ?? {
                                agentId: request.agentId,
                                ruleId: request.ruleId,
                                startedAt,
                            }),
                            status,
                            outcome,
                            error: status === "applied" ? undefined : outcome.message,
                            progressEvents: streamEvents,
                            stepIndex: Number.MAX_SAFE_INTEGER,
                            completedAt: new Date().toISOString(),
                        },
                    },
                }));
                resolve(outcome);
            };

            const failJob = (message: string) => {
                if (settled) return;
                const outcome: FixOutcome = {
                    rule_id: request.ruleId,
                    status: "Blocked",
                    message,
                    requires_restart: false,
                    requires_elevation: false,
                };
                settled = true;
                fixRuns.delete(key);
                if (fixSockets.get(key) === socket) fixSockets.delete(key);
                set((s) => ({
                    fixingRules: {
                        ...s.fixingRules,
                        [request.agentId]: { ...s.fixingRules[request.agentId], [request.ruleId]: false },
                    },
                    fixOutcomes: {
                        ...s.fixOutcomes,
                        [request.agentId]: { ...s.fixOutcomes[request.agentId], [request.ruleId]: outcome },
                    },
                    fixJobs: {
                        ...s.fixJobs,
                        [key]: {
                            ...(s.fixJobs[key] ?? {
                                agentId: request.agentId,
                                ruleId: request.ruleId,
                                startedAt,
                            }),
                            status: "failed",
                            outcome,
                            error: message,
                            progressEvents: streamEvents,
                            completedAt: new Date().toISOString(),
                        },
                    },
                }));
                reject(new Error(message));
            };

            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(String(event.data)) as FixStreamMessage;
                    if (message.type === "progress") {
                        streamEvents.push(message.data);
                        set((s) => ({
                            fixJobs: {
                                ...s.fixJobs,
                                [key]: {
                                    ...(s.fixJobs[key] ?? {
                                        agentId: request.agentId,
                                        ruleId: request.ruleId,
                                        status: "running" as const,
                                        startedAt,
                                    }),
                                    status: "running",
                                    progressEvents: [...streamEvents],
                                    stepIndex: Math.max(0, message.data.step - 1),
                                },
                            },
                        }));
                        return;
                    }

                    if (message.type === "outcome") {
                        if (message.data.status === "Applied" && streamEvents.length === 0) {
                            failJob("Agent returned success without live command/evidence output");
                            socket.close();
                            return;
                        }
                        completeJob(message.data);
                        socket.close();
                        return;
                    }

                    if (message.type === "error") {
                        failJob(message.message);
                        socket.close();
                    }
                } catch (error) {
                    failJob(error instanceof Error ? error.message : "Invalid fix stream message");
                    socket.close();
                }
            };

            socket.onerror = () => failJob("Fix progress stream failed");
            socket.onclose = () => {
                if (fixSockets.get(key) === socket) fixSockets.delete(key);
                if (!settled) {
                    const lastEvent = streamEvents.at(-1);
                    failJob(
                        lastEvent
                            ? `Fix progress stream closed before final outcome. Last event: ${lastEvent.action} (${lastEvent.status})`
                            : "Fix progress stream closed before completion",
                    );
                }
            };
        });

        fixRuns.set(key, run);
        return run;
    },
}));
