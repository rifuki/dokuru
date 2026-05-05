import type { AuditResponse } from "@/lib/api/agent-direct";

const AUDIT_HISTORY_CACHE_PREFIX = "agent_audit_history_";

function auditHistoryCacheKey(agentId: string) {
  return `${AUDIT_HISTORY_CACHE_PREFIX}${agentId}`;
}

export function sortAuditHistory(history: AuditResponse[]) {
  return [...history].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export function readCachedAuditHistory(agentId: string): AuditResponse[] {
  try {
    const raw = localStorage.getItem(auditHistoryCacheKey(agentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? sortAuditHistory(parsed as AuditResponse[]) : [];
  } catch {
    return [];
  }
}

export function writeCachedAuditHistory(agentId: string, history: AuditResponse[]) {
  try {
    localStorage.setItem(auditHistoryCacheKey(agentId), JSON.stringify(sortAuditHistory(history).slice(0, 20)));
  } catch {
    // Audit history cache is best-effort; the agent remains the source of truth.
  }
}
