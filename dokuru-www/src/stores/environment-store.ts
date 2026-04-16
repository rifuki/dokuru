import { create } from 'zustand';
import { environmentService, type Environment } from '@/lib/api/services/environment-services';

// Re-export Environment type
export type { Environment } from '@/lib/api/services/environment-services';

interface EnvironmentState {
  environments: Environment[];
  activeEnvironmentId: string | null;
  isLoading: boolean;

  // Actions
  fetchEnvironments: () => Promise<void>;
  addEnvironment: (env: Environment) => void;
  removeEnvironment: (id: string) => void;
  setActiveEnvironment: (id: string) => void;
  clearEnvironments: () => void;
}

export const useEnvironmentStore = create<EnvironmentState>()((set, get) => ({
  environments: [],
  activeEnvironmentId: null,
  isLoading: false,

  fetchEnvironments: async () => {
    set({ isLoading: true });
    try {
      const envs = await environmentService.list();
      set({ environments: envs });
      
      // Set first as active if none selected
      const state = get();
      if (!state.activeEnvironmentId && envs.length > 0) {
        set({ activeEnvironmentId: envs[0].id });
      }
    } catch (error) {
      console.error('Failed to fetch environments:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  addEnvironment: (env) =>
    set((state) => ({ environments: [...state.environments, env] })),

  removeEnvironment: (id) =>
    set((state) => ({
      environments: state.environments.filter((e) => e.id !== id),
      activeEnvironmentId: state.activeEnvironmentId === id ? null : state.activeEnvironmentId,
    })),

  setActiveEnvironment: (id) =>
    set({ activeEnvironmentId: id }),

  clearEnvironments: () =>
    set({ environments: [], activeEnvironmentId: null }),
}));
