import { create } from 'zustand';
import { dokuruApi } from '@/lib/api';
import { AuditReport, HealthStatus } from '@/types';

interface AppState {
  report: AuditReport | null;
  health: HealthStatus | null;
  isLoading: boolean;
  isFixing: boolean;
  score: number;
  fetchHealth: () => Promise<void>;
  fetchAudit: () => Promise<void>;
  applyFix: (ruleId: string) => Promise<boolean>;
  setReport: (report: AuditReport) => void;
}

export const useAppStore = create<AppState>((set) => ({
  report: null,
  health: null,
  isLoading: false,
  isFixing: false,
  score: 0,
  
  fetchHealth: async () => {
    try {
      const health = await dokuruApi.health();
      set({ health });
    } catch {
      set({ health: { status: 'error', docker_connected: false, docker_version: null } });
    }
  },

  fetchAudit: async () => {
    set({ isLoading: true });
    try {
      const report = await dokuruApi.audit();
      set({ report, score: report.score, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  applyFix: async (ruleId: string) => {
    set({ isFixing: true });
    try {
      const result = await dokuruApi.fix(ruleId);
      set({ isFixing: false });
      return result.status === 'success';
    } catch {
      set({ isFixing: false });
      return false;
    }
  },

  setReport: (report) => set({ report, score: report.score }),
}));
