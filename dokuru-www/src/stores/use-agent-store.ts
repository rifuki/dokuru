import { create } from "zustand";
import { agentApi } from "@/lib/api/agent";
import type { Agent, CreateAgentDto } from "@/types/agent";
import type { DockerInfo } from "@/lib/api/agent-direct";

export interface AgentInfoEntry {
  info: DockerInfo | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
}

type CachedAgentInfo = {
  url: string;
  cachedAt: number;
  info: DockerInfo;
};

const AGENT_INFO_CACHE_PREFIX = "agent_info_";

interface AgentState {
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
  agentOnlineStatus: Record<string, boolean>;
  agentConnectingStatus: Record<string, boolean>;
  agentConnectionError: Record<string, string | null>;
  agentInfos: Record<string, AgentInfoEntry>;

  fetchAgents: () => Promise<void>;
  createAgent: (dto: CreateAgentDto) => Promise<Agent>;
  updateAgent: (updated: Agent) => void;
  deleteAgent: (id: string) => Promise<void>;
  clearError: () => void;
  setAgentOnline: (id: string, online: boolean) => void;
  setAgentConnecting: (id: string, connecting: boolean) => void;
  setAgentConnectionError: (id: string, error: string | null) => void;
  setAgentInfo: (id: string, info: DockerInfo | null) => void;
  setAgentInfoLoading: (id: string, loading: boolean) => void;
  setAgentInfoError: (id: string, error: string) => void;
}

function cacheAgentToken(agent: Agent) {
  if (agent.token) {
    localStorage.setItem(`agent_token_${agent.id}`, agent.token);
  }
}

function agentInfoCacheKey(agentId: string) {
  return `${AGENT_INFO_CACHE_PREFIX}${agentId}`;
}

function readCachedAgentInfo(agent: Agent): DockerInfo | null {
  try {
    const raw = localStorage.getItem(agentInfoCacheKey(agent.id));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedAgentInfo;
    return cached.url === agent.url ? cached.info : null;
  } catch {
    return null;
  }
}

function writeCachedAgentInfo(agentId: string, info: DockerInfo | null) {
  try {
    if (!info) {
      localStorage.removeItem(agentInfoCacheKey(agentId));
      return;
    }

    const agent = useAgentStore.getState().agents.find((item) => item.id === agentId);
    if (!agent) return;

    localStorage.setItem(
      agentInfoCacheKey(agentId),
      JSON.stringify({ url: agent.url, cachedAt: Date.now(), info } satisfies CachedAgentInfo),
    );
  } catch {
    // Local cache is best-effort only.
  }
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  isLoading: false,
  error: null,
  agentOnlineStatus: {},
  agentConnectingStatus: {},
  agentConnectionError: {},
  agentInfos: {},

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const agents = await agentApi.list();
      agents.forEach(cacheAgentToken);
      set((state) => {
        const nextInfos = { ...state.agentInfos };
        for (const agent of agents) {
          if (nextInfos[agent.id]?.info) continue;
          const cached = readCachedAgentInfo(agent);
          if (cached) {
            nextInfos[agent.id] = { info: cached, loading: false, error: null, stale: true };
          }
        }
        return { agents, agentInfos: nextInfos, isLoading: false };
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createAgent: async (dto: CreateAgentDto) => {
    set({ isLoading: true, error: null });
    try {
      const agent = await agentApi.create(dto);

      cacheAgentToken(agent);

      set((state) => ({
        agents: [agent, ...state.agents],
        isLoading: false,
      }));
      return agent;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  updateAgent: (updated: Agent) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === updated.id ? updated : a)),
    })),

  deleteAgent: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await agentApi.delete(id);
      localStorage.removeItem(agentInfoCacheKey(id));
      set((state) => ({
        agents: state.agents.filter((a) => a.id !== id),
        isLoading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      throw err;
    }
  },

  clearError: () => set({ error: null }),

  setAgentOnline: (id, online) =>
    set((state) => ({ agentOnlineStatus: { ...state.agentOnlineStatus, [id]: online } })),

  setAgentConnecting: (id, connecting) =>
    set((state) => ({ agentConnectingStatus: { ...state.agentConnectingStatus, [id]: connecting } })),

  setAgentConnectionError: (id, error) =>
    set((state) => ({ agentConnectionError: { ...state.agentConnectionError, [id]: error } })),

  setAgentInfo: (id, info) =>
    set((state) => {
      writeCachedAgentInfo(id, info);
      return {
        agentInfos: { ...state.agentInfos, [id]: { info, loading: false, error: null, stale: false } },
      };
    }),

  setAgentInfoLoading: (id, loading) =>
    set((state) => ({
      agentInfos: {
        ...state.agentInfos,
        [id]: {
          info: state.agentInfos[id]?.info ?? null,
          loading,
          error: loading ? null : state.agentInfos[id]?.error ?? null,
          stale: state.agentInfos[id]?.stale ?? false,
        },
      },
    })),

  setAgentInfoError: (id, error) =>
    set((state) => ({
      agentInfos: {
        ...state.agentInfos,
        [id]: {
          info: state.agentInfos[id]?.info ?? null,
          loading: false,
          error,
          stale: state.agentInfos[id]?.stale ?? false,
        },
      },
    })),
}));

// Helper to get agent token from localStorage
export const getAgentToken = (agentId: string): string | null => {
  return localStorage.getItem(`agent_token_${agentId}`);
};

// Helper to set agent token in localStorage
export const setAgentToken = (agentId: string, token: string): void => {
  localStorage.setItem(`agent_token_${agentId}`, token);
};
