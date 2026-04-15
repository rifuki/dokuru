export const queryKeys = {
  health: {
    all: ['health'] as const,
    detail: () => [...queryKeys.health.all, 'detail'] as const,
  },
  audit: {
    all: ['audit'] as const,
    report: () => [...queryKeys.audit.all, 'report'] as const,
    rule: (id: string) => [...queryKeys.audit.all, 'rule', id] as const,
  },
  rules: {
    all: ['rules'] as const,
  },
  containers: {
    all: ['containers'] as const,
  }
};
