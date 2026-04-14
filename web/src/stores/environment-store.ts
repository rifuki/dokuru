import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type EnvironmentType = 'docker_standalone' | 'docker_swarm' | 'podman' | 'other';

export interface Environment {
  id: string;
  name: string;
  url: string;
  type: EnvironmentType;
  added_at: string;
}

interface EnvironmentState {
  environments: Environment[];
  activeEnvironmentId: string | null;
  // Computed / derived state that is not persisted
  isConnected: boolean;

  // Actions
  addEnvironment: (env: Environment) => void;
  removeEnvironment: (id: string) => void;
  setActiveEnvironment: (id: string) => void;
  setEnvironments: (envs: Environment[]) => void;
  fetchEnvironments: () => Promise<void>;
}

export const useEnvironmentStore = create<EnvironmentState>()(
  persist(
    (set, get) => ({
      environments: [],
      activeEnvironmentId: null,
      isConnected: false,

      addEnvironment: (env) =>
        set((state) => ({ environments: [...state.environments, env] })),

      removeEnvironment: (id) =>
        set((state) => ({
          environments: state.environments.filter((e) => e.id !== id),
          activeEnvironmentId: state.activeEnvironmentId === id ? null : state.activeEnvironmentId,
        })),

      setActiveEnvironment: (id) =>
        set({ activeEnvironmentId: id }),

      setEnvironments: (envs) =>
        set({ environments: envs }),

      fetchEnvironments: async () => {
        const state = get();
        // If no environments exist, user needs to add one manually
        if (state.environments.length === 0) {
          console.log('No environments configured. Please add an environment.');
          return;
        }
        
        // Set first environment as active if none selected
        if (!state.activeEnvironmentId && state.environments.length > 0) {
          set({ activeEnvironmentId: state.environments[0].id });
        }
      },
    }),
    {
      name: 'dokuru-environments',
      // Only persist configuration, not runtime connection status
      partialize: (state) => ({
        environments: state.environments,
        activeEnvironmentId: state.activeEnvironmentId,
      }),
    }
  )
);
