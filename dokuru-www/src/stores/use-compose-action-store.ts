import { create } from "zustand";
import { toast } from "sonner";
import { composeActionStreamUrl, type ComposeActionStreamEvent } from "@/services/docker-api";
import { queryClient } from "@/lib/query-client";

export type ComposeActionKind = "up" | "down";
export type ComposeActionSubmit =
  | { action: "up"; forceRecreate: boolean }
  | { action: "down"; volumes: boolean };
export type ComposeTerminalStream = "meta" | "stdout" | "stderr";
export type ComposeTerminalChunk = { id: number; stream: ComposeTerminalStream; data: string };

export type ComposeActionRun = {
  id: number;
  action: ComposeActionKind;
  stackName: string;
  agentId: string;
  isRunning: boolean;
  chunks: ComposeTerminalChunk[];
  final: Extract<ComposeActionStreamEvent, { type: "complete" }> | null;
  error: string | null;
  startedAt: Date;
};

interface ComposeActionStore {
  runs: ComposeActionRun[];
  evidenceOpen: boolean;
  setEvidenceOpen: (open: boolean) => void;
  clearRuns: () => void;
  startAction: (
    agentId: string,
    agentUrl: string,
    token: string,
    stackName: string,
    action: ComposeActionKind,
    payload: ComposeActionSubmit,
    accessToken?: string | null
  ) => void;
}

export const useComposeActionStore = create<ComposeActionStore>((set, get) => ({
  runs: [],
  evidenceOpen: false,
  setEvidenceOpen: (open) => set({ evidenceOpen: open }),
  clearRuns: () => set((state) => ({ runs: state.runs.filter((r) => r.isRunning) })),
  startAction: (agentId, agentUrl, token, stackName, action, payload, accessToken) => {
    const runId = Date.now() + Math.random();
    const newRun: ComposeActionRun = {
      id: runId,
      action,
      stackName,
      agentId,
      isRunning: true,
      chunks: [],
      final: null,
      error: null,
      startedAt: new Date(),
    };

    set((state) => ({
      runs: [newRun, ...state.runs].slice(0, 12),
      evidenceOpen: true,
    }));

    const updateRun = (update: Partial<ComposeActionRun>) => {
      set((state) => ({
        runs: state.runs.map((r) => (r.id === runId ? { ...r, ...update } : r)),
      }));
    };

    const appendChunk = (stream: ComposeTerminalStream, data: string) => {
      set((state) => {
        const normalized = data.replace(/\r/g, "\n");
        return {
          runs: state.runs.map((r) => {
            if (r.id !== runId) return r;
            return {
              ...r,
              chunks: [
                ...r.chunks,
                { id: Date.now() + Math.random(), stream, data: normalized },
              ].slice(-300),
            };
          }),
        };
      });
    };

    const streamUrl = composeActionStreamUrl(
      agentUrl,
      token,
      stackName,
      payload.action === "up"
        ? { action: "up", detach: true, force_recreate: payload.forceRecreate }
        : { action: "down", volumes: payload.volumes },
      accessToken ?? null,
    );

    if (!streamUrl) {
      const message = "Compose stream credentials are missing";
      updateRun({ isRunning: false, error: message });
      toast.error(message);
      return;
    }

    const socket = new WebSocket(streamUrl);

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as ComposeActionStreamEvent;
        if (event.type === "started") {
          appendChunk("meta", `$ ${event.command}\n`);
        } else if (event.type === "output") {
          appendChunk(event.stream, event.data);
        } else if (event.type === "complete") {
          updateRun({ isRunning: false, final: event });
          void queryClient.invalidateQueries({ queryKey: ["stacks", agentId] });
          void queryClient.invalidateQueries({ queryKey: ["containers", agentId] });
          void queryClient.invalidateQueries({ queryKey: ["agent-dashboard", agentId] });
          if (event.success) {
            toast.success(`Compose ${action} completed for ${stackName}`);
          } else {
            toast.error(`Compose ${action} failed for ${stackName}`, { description: `exit_code=${event.exit_code ?? "unknown"}` });
          }
          socket.close();
        } else if (event.type === "error") {
          const detail = event.detail ? `${event.error}: ${event.detail}` : event.error;
          updateRun({ isRunning: false, error: detail });
          appendChunk("stderr", `${detail}\n`);
          toast.error(event.error, { description: event.detail });
        }
      } catch {
        appendChunk("stdout", String(message.data));
      }
    };

    socket.onerror = () => {
      const message = "Compose stream connection failed";
      updateRun({ isRunning: false, error: message });
      toast.error(message);
    };

    socket.onclose = () => {
      const runs = get().runs;
      const run = runs.find((r) => r.id === runId);
      if (run && run.isRunning && !run.final && !run.error) {
        updateRun({ isRunning: false, error: "Compose stream closed before completion" });
      }
    };
  },
}));
