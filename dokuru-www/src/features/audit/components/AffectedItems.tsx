import { Link as RouterLink } from "@tanstack/react-router";
import { Container, FileText, Link as LinkIcon, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Container as DockerContainer } from "@/services/docker-api";

function normalizeAffectedItem(value: string) {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

function affectedIcon(item: string) {
  if (item.includes("dockerd") || item.includes("/usr/bin/") || item.includes("daemon")) {
    return Server;
  }
  if (item.includes(".sock") || item.includes(".socket")) {
    return LinkIcon;
  }
  if (item.includes("/etc/") || item.includes(".conf") || item.includes(".json") || item.includes(".service")) {
    return FileText;
  }
  return Container;
}

function findContainer(containers: DockerContainer[], item: string) {
  const normalized = normalizeAffectedItem(item);
  if (!normalized) return null;

  return containers.find((container) => {
    const id = container.id.toLowerCase();
    if (id === normalized || (normalized.length >= 12 && id.startsWith(normalized))) return true;
    return container.names.some((name) => normalizeAffectedItem(name) === normalized);
  }) ?? null;
}

export function AffectedItems({
  items,
  containers = [],
  agentId,
  chipClassName,
  returnTo,
}: {
  items: string[];
  containers?: DockerContainer[];
  agentId: string;
  chipClassName?: string;
  returnTo?: { source: "audit"; auditId?: string; ruleId: string };
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => {
        const Icon = affectedIcon(item);
        const container = findContainer(containers, item);
        const content = (
          <>
            <Icon className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            {item}
          </>
        );
        const className = cn(
          "inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[11px] text-foreground/70",
          container
            ? "border-[#2496ED]/30 bg-[#2496ED]/10 text-[#2496ED] hover:border-[#2496ED]/60 hover:bg-[#2496ED]/15"
            : "border-border bg-muted/40",
          chipClassName,
        );

        if (!container) {
          return <code key={`${item}-${i}`} className={className}>{content}</code>;
        }

        const search = returnTo
          ? { from: returnTo.source, auditId: returnTo.auditId, ruleId: returnTo.ruleId }
          : { from: "containers" as const };

        return (
          <RouterLink
            key={`${item}-${container.id}`}
            to="/agents/$id/containers/$containerId"
            params={{ id: agentId, containerId: container.id }}
            search={search}
            onClick={(event) => event.stopPropagation()}
            title={`Open container ${item}`}
            className={cn(className, "transition-colors")}
          >
            {content}
          </RouterLink>
        );
      })}
    </div>
  );
}
