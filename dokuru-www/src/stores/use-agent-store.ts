import { create } from "zustand";
import { agentApi } from "@/lib/api/agent";
import type { Agent, CreateAgentDto } from "@/types/agent";

interface AgentState {
  agents: Agent[];
  isLoading: boolean;
  error: string | null;

  fetchAgents: () => Promise<void>;
  createAgent: (dto: CreateAgentDto) => Promise<Agent>;
  deleteAgent: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  isLoading: false,
  error: null,

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
}));

// Helper to get agent token from localStorage
export const getAgentToken = (agentId: string): string | null => {
  return localStorage.getItem(`agent_token_${agentId}`);
};
