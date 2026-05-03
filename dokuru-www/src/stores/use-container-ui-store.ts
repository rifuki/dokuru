import { create } from "zustand";

export type ContainerTab = "overview" | "logs" | "stats" | "terminal" | "inspect";

interface ContainerUiState {
  showAllByAgent: Record<string, boolean>;
  searchByAgent: Record<string, string>;
  scrollYByAgent: Record<string, number>;
  expandedByAgent: Record<string, Record<string, boolean>>;
  activeTabs: Record<string, ContainerTab>;

  setShowAll: (agentId: string, showAll: boolean) => void;
  setSearch: (agentId: string, search: string) => void;
  setScrollY: (agentId: string, scrollY: number) => void;
  setContainerExpanded: (agentId: string, containerId: string, expanded: boolean) => void;
  setContainerTab: (agentId: string, containerId: string, tab: ContainerTab) => void;
}

export function containerUiKey(agentId: string, containerId: string) {
  return `${agentId}:${containerId}`;
}

export const useContainerUiStore = create<ContainerUiState>((set) => ({
  showAllByAgent: {},
  searchByAgent: {},
  scrollYByAgent: {},
  expandedByAgent: {},
  activeTabs: {},

  setShowAll: (agentId, showAll) =>
    set((state) => ({
      showAllByAgent: { ...state.showAllByAgent, [agentId]: showAll },
    })),

  setSearch: (agentId, search) =>
    set((state) => ({
      searchByAgent: { ...state.searchByAgent, [agentId]: search },
    })),

  setScrollY: (agentId, scrollY) =>
    set((state) => ({
      scrollYByAgent: { ...state.scrollYByAgent, [agentId]: scrollY },
    })),

  setContainerExpanded: (agentId, containerId, expanded) =>
    set((state) => ({
      expandedByAgent: {
        ...state.expandedByAgent,
        [agentId]: {
          ...state.expandedByAgent[agentId],
          [containerId]: expanded,
        },
      },
    })),

  setContainerTab: (agentId, containerId, tab) =>
    set((state) => ({
      activeTabs: {
        ...state.activeTabs,
        [containerUiKey(agentId, containerId)]: tab,
      },
    })),
}));
