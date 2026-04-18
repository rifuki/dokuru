import { create } from "zustand";
import { agentApi } from "@/lib/api/agent";
import type { Agent, CreateAgentDto } from "@/types/agent";

interface AgentState {
  agents: Agent[];
  isLoading: boolean;
  error: string | null;
  agentOnlineStatus: Record<string, boolean>;

  fetchAgents: () => Promise<void>;
  createAgent: (dto: CreateAgentDto) => Promise<Agent>;
  updateAgent: (updated: Agent) => void;
  deleteAgent: (id: string) => Promise<void>;
  clearError: () => void;
  setAgentOnline: (id: string, online: boolean) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  isLoading: false,
  error: null,
  agentOnlineStatus: {},

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const agents = await agentApi.list();
      set({ agents, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createAgent: async (dto: CreateAgentDto) => {
    set({ isLoading: true, error: null });
    try {
      const agent = await agentApi.create(dto);
      
      // Save token to localStorage (only returned on create)
      if (agent.token) {
        localStorage.setItem(`agent_token_${agent.id}`, agent.token);
      }
      
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
}));

// Helper to get agent token from localStorage
export const getAgentToken = (agentId: string): string | null => {
  return localStorage.getItem(`agent_token_${agentId}`);
};

// Helper to set agent token in localStorage
export const setAgentToken = (agentId: string, token: string): void => {
  localStorage.setItem(`agent_token_${agentId}`, token);
};
