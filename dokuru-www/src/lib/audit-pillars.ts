import { Box, Gauge, Shield, Server, Image } from "lucide-react";
import type { AuditResult } from "./api/agent-direct";

export type SecurityPillar = "namespace" | "cgroup" | "runtime" | "host" | "images";

export const PILLAR_META = {
  namespace: {
    name: "Namespace Isolation",
    icon: Box,
    color: "text-blue-400",
    bg: "bg-muted/30",
    border: "border-border",
    barColor: "bg-blue-400",
  },
  cgroup: {
    name: "Cgroup Controls",
    icon: Gauge,
    color: "text-amber-400",
    bg: "bg-muted/30",
    border: "border-border",
    barColor: "bg-amber-400",
  },
  runtime: {
    name: "Runtime Hardening",
    icon: Shield,
    color: "text-rose-400",
    bg: "bg-muted/30",
    border: "border-border",
    barColor: "bg-rose-400",
  },
  host: {
    name: "Host Configuration",
    icon: Server,
    color: "text-violet-400",
    bg: "bg-muted/30",
    border: "border-border",
    barColor: "bg-violet-400",
  },
  images: {
    name: "Images & Daemon",
    icon: Image,
    color: "text-[#2496ED]",
    bg: "bg-muted/30",
    border: "border-border",
    barColor: "bg-[#2496ED]",
  },
} as const;

// Map rule IDs to security pillars
export function getRulePillar(ruleId: string): SecurityPillar {
  // Namespace rules
  if (["2.8", "2.10", "5.9", "5.10", "5.16", "5.17", "5.21", "5.31"].includes(ruleId)) {
    return "namespace";
  }
  
  // Cgroup rules
  if (["2.11", "5.11", "5.12", "5.19", "5.25", "5.29"].includes(ruleId)) {
    return "cgroup";
  }
  
  // Runtime hardening rules
  if (["5.3", "5.4", "5.5", "5.13", "5.18", "5.20", "5.22", "5.23", "5.24", "5.26", "5.32"].includes(ruleId)) {
    return "runtime";
  }
  
  // Host configuration (Section 1)
  if (ruleId.startsWith("1.")) {
    return "host";
  }
  
  // Images & Daemon (Sections 2, 3, 4 - except namespace/cgroup specific)
  if (ruleId.startsWith("2.") || ruleId.startsWith("3.") || ruleId.startsWith("4.")) {
    return "images";
  }
  
  // Default fallback
  return "host";
}

export function groupResultsByPillar(results: AuditResult[]) {
  const grouped = new Map<SecurityPillar, AuditResult[]>();
  
  for (const result of results) {
    const pillar = getRulePillar(result.rule.id);
    if (!grouped.has(pillar)) {
      grouped.set(pillar, []);
    }
    grouped.get(pillar)!.push(result);
  }
  
  return grouped;
}

export function getPillarStats(results: AuditResult[]) {
  const pillar = getRulePillar(results[0]?.rule.id || "");
  const total = results.length;
  const passed = results.filter(r => r.status === "Pass").length;
  const failed = results.filter(r => r.status === "Fail").length;
  const errors = results.filter(r => r.status === "Error").length;
  
  return { pillar, total, passed, failed, errors };
}
