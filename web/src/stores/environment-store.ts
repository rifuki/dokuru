import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/api/client';

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
        try {
          const envs = await apiClient.get<Environment[]>('/environments');
          set({ environments: envs });
          // If no active environment is set, pick the first one from the backend
          const state = get();
          if (!state.activeEnvironmentId && envs.length > 0) {
            set({ activeEnvironmentId: envs[0].id });
          }
        } catch (error) {
          console.error('Failed to fetch environments:', error);
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
