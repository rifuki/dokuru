import { useQuery } from "@tanstack/react-query";
import type { AdminAgent } from "@/features/admin/types/stats";

export type AdminAgentResolvedStatus = "online" | "offline" | "never" | "stale";

const RELAY_ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function hasRecentHeartbeat(lastSeen: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() <= RELAY_ONLINE_WINDOW_MS;
}

export function useAdminAgentStatuses(agents: AdminAgent[]) {
  const signature = agents
    .map((agent) => `${agent.id}:${agent.url}:${agent.access_mode}:${agent.last_seen ?? "none"}`)
    .join("|");

  const query = useQuery<Record<string, AdminAgentResolvedStatus>>({
    queryKey: ["admin", "agents", "live-status", signature],
    enabled: agents.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
    queryFn: async () => {
      const now = Date.now();

      const results = await Promise.all(
        agents.map(async (agent) => {
          if (agent.access_mode === "relay") {
            if (!agent.last_seen) {
              return [agent.id, "never"] as const;
            }

            const isOnline = now - new Date(agent.last_seen).getTime() <= RELAY_ONLINE_WINDOW_MS;
            return [agent.id, isOnline ? "online" : "offline"] as const;
          }

          try {
            const response = await fetch(`${agent.url}/health`, {
              method: "GET",
              signal: AbortSignal.timeout(5_000),
            });

            if (response.ok) {
              return [agent.id, "online"] as const;
            }
          } catch {
            // Fall through to stale/never classification below.
          }

          if (!agent.last_seen) {
            return [agent.id, "never"] as const;
          }

          return [agent.id, "stale"] as const;
        })
      );

      return Object.fromEntries(results);
    },
  });

  const statuses = query.data ?? {};
  const counts = agents.reduce(
    (acc, agent) => {
      const status = statuses[agent.id] ?? (agent.last_seen ? "stale" : "never");
      acc[status] += 1;
      if (hasRecentHeartbeat(agent.last_seen)) {
        acc.recentHeartbeat += 1;
      }
      return acc;
    },
    { online: 0, offline: 0, never: 0, stale: 0, recentHeartbeat: 0 }
  );

  return {
    ...query,
    statuses,
    counts,
  };
}
