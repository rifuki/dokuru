import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { agentApi } from "@/lib/api/agent";
import {
  agentDirectApi,
  type AuditGroupSummary,
  type AuditRemediationAction,
  type AuditRemediationEffort,
  type AuditRemediationPlan,
  type AuditResponse,
  type AuditResult,
  type FixHistoryEntry,
} from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";
import { canUseDockerAgent, dockerApi, dockerCredential, type Container as DockerContainer } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, ShieldCheck, ShieldX, Shield, ChevronDown, ChevronUp,
  Terminal, Wrench, AlertTriangle, Server,
  ArrowLeft, Clock, Cpu, Container, BookOpen,
  Search, X, Layers, ArrowLeftRight, Link, FileText, Download, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PILLAR_META, getRulePillar, type SecurityPillar } from "@/lib/audit-pillars";
import { userDocumentApi } from "@/lib/api/document";
import { getOrFetchPdfBlob } from "@/lib/pdf-cache";
import { LOCAL_AGENT_ID } from "@/lib/local-agent";
import { fixJobKey, useAuditStore } from "@/stores/use-audit-store";
import { FixWizard } from "@/features/audit/components/FixWizard";
import { FixAllWizard } from "@/features/audit/components/FixAllWizard";
import { FixHistoryPanel } from "@/features/audit/components/FixHistoryPanel";
import { AffectedItems } from "@/features/audit/components/AffectedItems";
import { useFix } from "@/features/audit/hooks/useFix";
import { useFixAll } from "@/features/audit/hooks/useFixAll";

type AuditDetailSearch = {
  ruleId?: string;
};

const AUDIT_DETAIL_SCROLL_PREFIX = "dokuru_audit_detail_scroll_";

function auditDetailScrollKey(agentId: string, auditId: string) {
  return `${AUDIT_DETAIL_SCROLL_PREFIX}${agentId}:${auditId}`;
}

function readSavedWindowScrollY(key: string) {
  try {
    const value = Number(window.sessionStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeSavedWindowScrollY(key: string, scrollY: number) {
  try {
    window.sessionStorage.setItem(key, String(Math.max(0, Math.round(scrollY))));
  } catch {
    // Scroll memory is a convenience; ignore storage failures.
  }
}

export const Route = createFileRoute("/_authenticated/agents/$id/audits/$auditId")({
  validateSearch: (search: Record<string, unknown>): AuditDetailSearch => ({
    ruleId: typeof search.ruleId === "string" ? search.ruleId : undefined,
  }),
  component: AuditDetailPage,
});

// ── Section metadata (CIS sections) ─────────────────────────────────────────

const SECTION_META: Record<string, { label: string; num: string; color: string; bg: string; border: string }> = {
  "Host Configuration": { label: "Host", num: "S1", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
  "Docker Daemon Configuration": { label: "Daemon", num: "S2", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
  "Daemon Configuration": { label: "Daemon", num: "S2", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
  "Docker Daemon Configuration Files": { label: "Files", num: "S3", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
  "Config File Permissions": { label: "Files", num: "S3", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
  "Container Images and Build Files": { label: "Images", num: "S4", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
  "Container Images": { label: "Images", num: "S4", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
  "Container Runtime": { label: "Runtime", num: "S5", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
};

function sectionMeta(section: string) {
  return SECTION_META[section] ?? { label: section, num: "", color: "text-gray-500", bg: "bg-gray-500/10", border: "border-gray-500/30" };
}

function sortAuditResults(results: AuditResult[]) {
  return [...results].sort((a, b) => {
    if (a.status !== b.status) return a.status === "Fail" ? -1 : 1;
    return a.rule.id.localeCompare(b.rule.id, undefined, { numeric: true });
  });
}

function groupSummariesFromResults(results: AuditResult[], keyForResult: (result: AuditResult) => string, labelForKey: (key: string) => string): AuditGroupSummary[] {
  const groups = new Map<string, { passed: number; failed: number; errors: number }>();

  for (const result of results) {
    const key = keyForResult(result);
    const group = groups.get(key) ?? { passed: 0, failed: 0, errors: 0 };
    if (result.status === "Pass") group.passed += 1;
    else if (result.status === "Fail") group.failed += 1;
    else group.errors += 1;
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, group]) => {
    const total = group.passed + group.failed + group.errors;
    return {
      key,
      label: labelForKey(key),
      number: null,
      total,
      passed: group.passed,
      failed: group.failed,
      errors: group.errors,
      percent: total > 0 ? Math.round((group.passed / total) * 100) : 0,
    };
  });
}

function severityRank(severity: string) {
  if (severity === "High") return 3;
  if (severity === "Medium") return 2;
  return 1;
}

const KNOWN_AUTO_FIX_RULE_IDS = new Set([
  "1.1.1", "1.1.3", "1.1.4", "1.1.5", "1.1.6", "1.1.7", "1.1.8", "1.1.9", "1.1.10", "1.1.11", "1.1.12", "1.1.14", "1.1.18",
  "2.10",
  "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.17", "3.18",
  "4.1", "4.6",
  "5.5", "5.10", "5.11", "5.12", "5.16", "5.17", "5.21", "5.25", "5.29", "5.31",
]);

function remediationKindForResult(result: AuditResult): AuditResult["remediation_kind"] {
  return result.remediation_kind ?? (KNOWN_AUTO_FIX_RULE_IDS.has(result.rule.id) ? "auto" : "manual");
}

function isAutoFixableResult(result: AuditResult) {
  return result.status === "Fail" && remediationKindForResult(result) === "auto";
}

function effortForResult(result: AuditResult): AuditRemediationEffort {
  const remediationKind = remediationKindForResult(result);
  if (remediationKind === "auto") return "quick";
  if (remediationKind === "guided") return "moderate";
  return "involved";
}

function buildRemediationPlan(results: AuditResult[]): AuditRemediationPlan {
  const failed = results.filter(result => result.status === "Fail");
  const autoFixable = failed.filter(result => remediationKindForResult(result) === "auto").length;
  const guided = failed.filter(result => remediationKindForResult(result) === "guided").length;
  const highImpact = failed.filter(result => result.rule.severity === "High").length;
  const mediumImpact = failed.filter(result => result.rule.severity === "Medium").length;

  const actions: AuditRemediationAction[] = failed
    .map((result) => {
      const pillar = getRulePillar(result.rule.id);
      const remediationKind = remediationKindForResult(result);
      const effort = effortForResult(result);
      const riskScore = severityRank(result.rule.severity) * 100
        + (remediationKind === "auto" ? 30 : remediationKind === "guided" ? 15 : 0)
        + Math.min(result.affected.length, 10);

      return {
        rank: 0,
        rule_id: result.rule.id,
        title: result.rule.title,
        severity: result.rule.severity,
        section_key: result.rule.section,
        section_label: result.rule.section,
        pillar_key: pillar,
        pillar_label: PILLAR_META[pillar].name,
        remediation_kind: remediationKind,
        effort,
        risk_score: riskScore,
        affected_count: result.affected.length,
        command_available: Boolean(result.audit_command),
        summary: result.remediation_guide || result.rule.remediation || result.message,
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score || a.rule_id.localeCompare(b.rule_id, undefined, { numeric: true }))
    .map((action, index) => ({ ...action, rank: index + 1 }));

  return {
    total_failed: failed.length,
    auto_fixable: autoFixable,
    guided,
    manual: failed.length - autoFixable - guided,
    high_impact: highImpact,
    medium_impact: mediumImpact,
    low_impact: failed.length - highImpact - mediumImpact,
    quick_wins: autoFixable,
    actions,
  };
}


// ── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity, status }: { severity: string; status?: "Pass" | "Fail" | "Error" }) {
  if (status === "Pass") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
        {severity} if failed
      </span>
    );
  }

  const config: Record<string, { cls: string; dot: string }> = {
    High: { cls: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400" },
    Medium: { cls: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
    Low: { cls: "bg-muted/40 text-muted-foreground border-border", dot: "bg-zinc-500" },
  };
  const c = config[severity] ?? config.Low;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase", c.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", c.dot)} />
      {severity}
    </span>
  );
}

function ruleStatusTone(status: "Pass" | "Fail" | "Error") {
  if (status === "Pass") {
    return {
      borderLeft: "border-l-emerald-500/60",
      cardTone: "border-border bg-card/85 hover:bg-muted/[0.06]",
      icon: "text-emerald-400",
    };
  }

  if (status === "Fail") {
    return {
      borderLeft: "border-l-rose-500/70",
      cardTone: "border-border bg-card/95 hover:bg-muted/[0.08]",
      icon: "text-rose-400",
    };
  }

  return {
    borderLeft: "border-l-amber-500/60",
    cardTone: "border-border bg-card/95 hover:bg-muted/[0.08]",
    icon: "text-amber-400",
  };
}

function RuleStatusBadge({ status }: { status: "Pass" | "Fail" | "Error" }) {
  const config = {
    Pass: { label: "Passed", cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
    Fail: { label: "Needs fix", cls: "border-rose-500/25 bg-rose-500/10 text-rose-400", dot: "bg-rose-400" },
    Error: { label: "Error", cls: "border-amber-500/20 bg-amber-500/10 text-amber-400", dot: "bg-amber-400" },
  }[status];

  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold", config.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}

// ── Status indicator ─────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: "Pass" | "Fail" | "Error" }) {
  if (status === "Pass") return <ShieldCheck className={cn("h-5 w-5 shrink-0", ruleStatusTone(status).icon)} />;
  if (status === "Fail") return <ShieldX className={cn("h-5 w-5 shrink-0", ruleStatusTone(status).icon)} />;
  return <Shield className={cn("h-5 w-5 shrink-0", ruleStatusTone(status).icon)} />;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Command copied");
  } catch {
    toast.error("Failed to copy command");
  }
}

function AuditCommandBlock({ label, command }: { label: string; command: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{label}</p>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => void copyText(command)}>
          Copy
        </Button>
      </div>
      <code className="block overflow-x-auto whitespace-pre-wrap rounded border border-border/70 bg-background p-3 font-mono text-xs text-[#0969aa] shadow-xs dark:bg-zinc-950 dark:text-emerald-400">
        $ {command}
      </code>
    </div>
  );
}

function CommandOutputBlock({ label, output }: { label: string; output?: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-border/70 bg-background p-3 font-mono text-xs text-foreground/80 shadow-xs dark:bg-zinc-950 dark:text-zinc-300">
        {output || "(no output)"}
      </pre>
    </div>
  );
}

// ── Rule Card ────────────────────────────────────────────────────────────────

function AgentVerificationPanel({
  agentId,
  agentUrl,
  agentAccessMode,
  token,
  ruleId,
  auditCommand,
}: {
  agentId: string;
  agentUrl: string;
  agentAccessMode?: string;
  token?: string;
  ruleId: string;
  auditCommand?: string;
}) {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canRun = agentAccessMode === "relay" || !!agentUrl;
  const command = result?.audit_command ?? auditCommand;

  const runVerification = async () => {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    try {
      const nextResult = agentAccessMode === "relay"
        ? await agentApi.verifyFix(agentId, ruleId)
        : await agentDirectApi.verifyFix(agentUrl, ruleId, token);
      setResult(nextResult);
      setVerifiedAt(new Date().toLocaleTimeString());
    } catch (verifyError) {
      setResult(null);
      setVerifiedAt(null);
      setError(verifyError instanceof Error ? verifyError.message : "Failed to run verification on agent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[#2496ED]/35 bg-[#2496ED]/8 dark:border-[#2496ED]/20 dark:bg-[#2496ED]/5">
      <div className="flex items-center justify-between gap-3 border-b border-[#2496ED]/20 bg-background/55 px-3 py-2 dark:bg-transparent">
        <div className="flex items-center gap-2 min-w-0">
            <Terminal className="h-3.5 w-3.5 text-[#2496ED] shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#2496ED]">Agent Verify</p>
              <p className="truncate text-[11px] text-foreground/65 dark:text-muted-foreground">Run the registered audit command on the remote host now.</p>
            </div>
          </div>
        <Button size="sm" variant="outline" disabled={!canRun || loading} onClick={() => void runVerification()} className="h-8 shrink-0">
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Terminal className="mr-1.5 h-3.5 w-3.5" />}
          Run Verify
        </Button>
      </div>

      <div className="space-y-3 p-3">
        {!result && !error && (
          <p className="text-xs text-foreground/70 dark:text-muted-foreground/70">
            Dokuru only executes the whitelisted audit command for rule {ruleId}, then returns real stdout, stderr, and exit code from the agent host.
          </p>
        )}

        {command && <AuditCommandBlock label="Registered Audit Command" command={command} />}

        {error && (
          <div className="rounded border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={result.rule.severity} status={result.status} />
              <span className={cn(
                "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase",
                result.status === "Pass" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : result.status === "Fail" ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                : "border-amber-500/20 bg-amber-500/10 text-amber-400"
              )}>
                {result.status}
              </span>
              <span className="text-xs text-muted-foreground">{result.message}</span>
              {verifiedAt && <span className="text-[11px] text-muted-foreground/60">Verified at {verifiedAt}</span>}
              {typeof result.command_exit_code === "number" && (
                <span className="rounded border border-border/50 bg-background/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                  exit {result.command_exit_code}
                </span>
              )}
            </div>

            <CommandOutputBlock label="Shell stdout" output={result.raw_output} />
            {result.command_stderr && <CommandOutputBlock label="Shell stderr" output={result.command_stderr} />}
          </div>
        )}
      </div>
    </div>
  );
}

function RuleCard({ result, agentId, auditId, auditTimestamp, agentUrl, agentAccessMode, token, containers, focusedRuleId, appliedFixEntry, onOpenWizard }: {
  result: AuditResult;
  agentId: string;
  auditId: string;
  auditTimestamp?: string;
  agentUrl: string;
  agentAccessMode?: string;
  token?: string;
  containers?: DockerContainer[];
  focusedRuleId?: string;
  appliedFixEntry?: FixHistoryEntry;
  onOpenWizard: (result: AuditResult) => void;
}) {
  const { rule, status, message, affected, audit_command, raw_output, command_stderr, command_exit_code, references, rationale, impact, remediation_guide } = result;
  const remediation_kind = remediationKindForResult(result);
  const fixJob = useAuditStore((state) => state.fixJobs[fixJobKey(agentId, rule.id)]);
  const storedOutcome = useAuditStore((state) => state.fixOutcomes[agentId]?.[rule.id] ?? null);
  const isFocused = focusedRuleId === rule.id;
  const cardRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(isFocused);
  const [activeTab, setActiveTab] = useState<"overview" | "fix" | "debug">(isFocused ? "fix" : "overview");
  const [cisDialogOpen, setCisDialogOpen] = useState(false);

  useEffect(() => {
    if (!isFocused) return;
    const timeout = window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [isFocused]);

  const statusTone = ruleStatusTone(status);

  const pillar = getRulePillar(rule.id);
  const pillarMeta = PILLAR_META[pillar];
  const PillarIcon = pillarMeta.icon;

  const hasFix = status === "Fail" && !!(rule.remediation || remediation_guide || affected.length > 0 || remediation_kind === "auto");
  const hasDebug = !!(audit_command || raw_output !== undefined || command_stderr || typeof command_exit_code === "number" || (references && references.length > 0));
  const isCurrentFixJob = isFixJobAfterAudit(fixJob, auditTimestamp ? { timestamp: auditTimestamp } : null);
  const isFixing = isCurrentFixJob && fixJob?.status === "running";
  const isFixed = (isCurrentFixJob && fixJob?.status === "applied") || appliedFixEntry?.outcome.status === "Applied";
  const isFixBlocked = isCurrentFixJob && (fixJob?.status === "blocked" || fixJob?.status === "failed" || storedOutcome?.status === "Blocked");
  const tabs = [
    { id: "overview" as const, label: "Overview", show: true },
    { id: "fix" as const, label: "Fix", show: hasFix },
    { id: "debug" as const, label: "Debug", show: hasDebug },
  ].filter(t => t.show);

  return (
    <div ref={cardRef} className={cn("overflow-hidden rounded-xl border border-l-[3px] shadow-sm transition-colors", statusTone.borderLeft, statusTone.cardTone, isFocused && "ring-2 ring-primary/40")}>
      {/* Header row */}
      <div className="px-5 py-4 flex items-center gap-3">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <StatusIcon status={status} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <RuleStatusBadge status={status} />
              <span className="inline-flex h-6 items-center rounded-md border border-border/70 bg-muted/35 px-2 font-mono text-[11px] font-bold text-muted-foreground/80">
                {rule.id}
              </span>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border/70 bg-muted/25 px-2 text-xs font-medium text-muted-foreground">
                <PillarIcon size={10} className={pillarMeta.color} />
                {pillarMeta.name}
              </span>
              <SeverityBadge severity={rule.severity} status={status} />
              {isFixing && (
                <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-[#2496ED]/30 bg-[#2496ED]/10 px-2 text-xs font-semibold text-[#2496ED]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Fixing now
                </span>
              )}
              {isFixed && (
                <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 text-xs font-semibold text-emerald-400">
                  <ShieldCheck className="h-3 w-3" />
                  Fix applied
                </span>
              )}
              {!isFixing && !isFixed && isFixBlocked && (
                <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 text-xs font-semibold text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  Fix needs review
                </span>
              )}
              {affected.length > 0 && (
                <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border/70 bg-muted/25 px-2 text-xs font-medium text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-muted-foreground/65" />
                  {affected.length} affected
                </span>
              )}
            </div>
            <p className="font-medium text-sm leading-snug text-foreground">{rule.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{message}</p>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {status === "Fail" && remediation_kind === "auto" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (appliedFixEntry) {
                  useAuditStore.getState().setFixOutcome(agentId, rule.id, appliedFixEntry.outcome);
                } else if (!isFixed && storedOutcome) {
                  useAuditStore.getState().setFixOutcome(agentId, rule.id, null);
                }
                onOpenWizard(result);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md text-white transition-all shadow-sm",
                isFixed ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#2496ED] hover:bg-[#1d7ac7]",
              )}
            >
              {isFixing ? <Loader2 className="h-3 w-3 animate-spin" /> : isFixed ? <ShieldCheck className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
              {isFixing ? "View Progress" : isFixed ? "View Result" : "Apply Fix"}
            </button>
          )}
          <button onClick={() => setOpen(v => !v)} className="p-1 hover:bg-muted/40 rounded transition-colors">
            {open
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </button>
        </div>
      </div>

      {/* Expanded: tabbed content */}
      {open && (
        <div className="border-t border-border/60">
          {/* Tab bar */}
          <div className="flex items-center px-4 border-b border-border/60">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
                  activeTab === tab.id
                    ? "border-[#2496ED] text-[#2496ED]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Overview: description + rationale/impact */}
            {activeTab === "overview" && (
              <div className="space-y-3">
                {rule.description && (
                  <p className="text-sm text-foreground/70 leading-relaxed">{rule.description}</p>
                )}
                {(rationale || impact) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {rationale && (
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1.5">Rationale</p>
                        <p className="text-xs text-foreground/60 leading-relaxed">{rationale}</p>
                      </div>
                    )}
                    {impact && (
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1.5">Impact</p>
                        <p className="text-xs text-foreground/60 leading-relaxed">{impact}</p>
                      </div>
                    )}
                  </div>
                )}
                {!rule.description && !rationale && !impact && (
                  <p className="text-xs text-muted-foreground/40 italic">No description available.</p>
                )}
              </div>
            )}

            {/* Fix: affected + remediation + fix guide */}
            {activeTab === "fix" && (
              <div className="space-y-3">
                {affected.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">
                      Affected ({affected.length})
                    </p>
                    <AffectedItems
                      items={affected}
                      containers={containers}
                      agentId={agentId}
                      returnTo={{ source: "audit", auditId, ruleId: rule.id }}
                    />
                  </div>
                )}
                {rule.remediation && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Remediation</p>
                    <p className="text-xs text-foreground/70 bg-muted/30 rounded-lg p-3 font-mono leading-relaxed border border-border">
                      {rule.remediation}
                    </p>
                  </div>
                )}
                {remediation_guide && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Fix Guide</p>
                    <pre className="text-xs bg-muted/50 text-muted-foreground rounded-lg p-3 font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto border border-border/50 dark:bg-zinc-950 dark:text-zinc-300">
                      {remediation_guide}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Debug: audit command + raw output + references */}
            {activeTab === "debug" && (
              <div className="space-y-3">
                <AgentVerificationPanel
                  agentId={agentId}
                  agentUrl={agentUrl}
                  agentAccessMode={agentAccessMode}
                  token={token}
                  ruleId={rule.id}
                  auditCommand={audit_command}
                />
                {(raw_output !== undefined || command_stderr || typeof command_exit_code === "number") && (
                  <div className="space-y-2 rounded-lg border border-border/80 bg-background/80 p-3 dark:bg-muted/20">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Saved Audit Run</p>
                      {typeof command_exit_code === "number" && (
                        <span className="rounded border border-border/50 bg-background/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                          exit {command_exit_code}
                        </span>
                      )}
                    </div>
                    <CommandOutputBlock label="Saved shell stdout" output={raw_output} />
                    {command_stderr && <CommandOutputBlock label="Saved shell stderr" output={command_stderr} />}
                  </div>
                )}
                {references && references.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">References</p>
                    <div className="space-y-1.5">
                      {references.map((ref, i) => {
                        const isCIS = ref.includes("CIS Docker Benchmark");
                        if (isCIS) {
                          return (
                            <button
                              key={i}
                              onClick={() => setCisDialogOpen(true)}
                              className="flex items-center gap-1.5 text-xs text-[#2496ED] hover:underline w-full text-left"
                            >
                              <BookOpen className="h-3 w-3 shrink-0" />
                              {ref}
                            </button>
                          );
                        }
                        return (
                          <a key={i} href={ref.startsWith("http") ? ref : undefined}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-[#2496ED] hover:underline">
                            <Link className="h-3 w-3 shrink-0" />
                            {ref}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <CisPdfDialog open={cisDialogOpen} onClose={() => setCisDialogOpen(false)} />
    </div>
  );
}

// ── Audit breakdown rows ─────────────────────────────────────────────────────

function AuditBreakdownRow({
  leading,
  label,
  total,
  passed,
  fixedCount = 0,
  fixedRuleIds = [],
}: {
  leading: ReactNode;
  label: string;
  total: number;
  passed: number;
  fixedCount?: number;
  fixedRuleIds?: string[];
}) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const projectedPassed = Math.min(total, passed + fixedCount);
  const projectedPct = total > 0 ? Math.round((projectedPassed / total) * 100) : 0;
  const hasProjection = fixedCount > 0 && projectedPct > pct;
  const bridgePoint = hasProjection && projectedPct > 0 ? (pct / projectedPct) * 100 : pct;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-9 shrink-0 items-center justify-start">
          {leading}
        </span>
        <span className="text-sm font-semibold leading-5 text-foreground/90">{label}</span>
        {hasProjection && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#2496ED]/10 px-2 py-0.5 text-[10px] font-bold text-[#2496ED]" title={fixedRuleIds.join(", ")}>
            +{fixedCount} fixed
          </span>
        )}
        <span className="text-xs text-muted-foreground/60 font-mono ml-auto">
          {passed}<span className="text-muted-foreground/40">/</span>{total}
          {hasProjection && <span className="text-[#2496ED]"> → {projectedPassed}<span className="text-[#2496ED]/50">/</span>{total}</span>}
        </span>
      </div>
      <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
        {hasProjection ? (
          <div
            className="h-full rounded-full shadow-[0_0_14px_rgba(36,150,237,0.25)] transition-all duration-700"
            style={{
              width: `${projectedPct}%`,
              background: `linear-gradient(90deg, ${progressBarColor(pct)} 0%, ${progressBarColor(pct)} ${Math.max(0, bridgePoint - 8)}%, #2496ED ${Math.min(100, bridgePoint + 8)}%, #2496ED 100%)`,
            }}
          />
        ) : (
          <div
            className={cn("h-full rounded-full transition-all duration-700", progressTone(pct))}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function SectionHeader({ section, total, passed, fixedCount, fixedRuleIds }: { section: string; total: number; passed: number; fixedCount?: number; fixedRuleIds?: string[] }) {
  const meta = sectionMeta(section);
  return (
    <AuditBreakdownRow
      leading={(
        <span className="inline-flex h-5 min-w-7 items-center justify-center rounded border border-border bg-muted/30 px-1.5 font-mono text-[10px] font-bold leading-none text-muted-foreground">
          {meta.num}
        </span>
      )}
      label={meta.label}
      total={total}
      passed={passed}
      fixedCount={fixedCount}
      fixedRuleIds={fixedRuleIds}
    />
  );
}

// ── Before/after comparison ──────────────────────────────────────────────────

function scoreTone(score: number) {
  return score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-rose-400";
}

function progressTone(percent: number) {
  return percent === 100 ? "bg-emerald-500" : percent >= 50 ? "bg-amber-500" : "bg-rose-500";
}

function BeforeAfterComparison({
  before,
  after,
  fmtDate,
}: {
  before: AuditResponse;
  after: AuditResponse;
  fmtDate: (ts: string) => string;
}) {
  const scoreDelta = after.summary.score - before.summary.score;
  const passDelta = after.summary.passed - before.summary.passed;
  const failDelta = after.summary.failed - before.summary.failed;
  const beforeByRule = new Map(before.results.map(result => [result.rule.id, result]));
  const fixedRules = after.results.filter(result => result.status === "Pass" && beforeByRule.get(result.rule.id)?.status === "Fail");
  const regressedRules = after.results.filter(result => result.status === "Fail" && beforeByRule.get(result.rule.id)?.status === "Pass");
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  const scoreDeltaTone = scoreDelta > 0 ? "text-emerald-400" : scoreDelta < 0 ? "text-rose-400" : "text-muted-foreground";
  const passDeltaTone = passDelta > 0 ? "text-emerald-400" : passDelta < 0 ? "text-rose-400" : "text-muted-foreground/60";
  const failDeltaTone = failDelta < 0 ? "text-emerald-400" : failDelta > 0 ? "text-rose-400" : "text-muted-foreground/60";

  return (
    <div className="rounded-2xl border border-border bg-card dark:bg-gradient-to-br dark:from-[#0A0A0B] dark:to-[#111113] overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight">Before / After Comparison</h3>
          <p className="text-sm text-muted-foreground">Compare the previous audit against the current one to track hardening progress.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-bold text-muted-foreground">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          score delta <span className={scoreDeltaTone}>{signed(scoreDelta)}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Before</p>
            <span className="text-xs font-mono text-muted-foreground/60">{fmtDate(before.timestamp)}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-[132px_1fr] lg:items-stretch">
            <div className="flex min-h-[92px] flex-col justify-center rounded-[12px] border border-border/80 bg-muted/20 px-4 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Score</p>
              <div className="mt-2 flex items-end gap-2">
                <span className={cn("text-4xl font-black tabular-nums leading-none", scoreTone(before.summary.score))}>
                  {before.summary.score}
                </span>
                <span className="pb-1 text-sm font-mono text-muted-foreground">/100</span>
              </div>
            </div>
            <div className="grid min-h-[92px] grid-cols-3 divide-x divide-border overflow-hidden rounded-[12px] border border-border/80 bg-muted/20">
              <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                <p className="text-xl font-black leading-none text-emerald-400">{before.summary.passed}</p>
                <p className="mt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Pass</p>
              </div>
              <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                <p className="text-xl font-black leading-none text-rose-400">{before.summary.failed}</p>
                <p className="mt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Fail</p>
              </div>
              <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                <p className="text-xl font-black leading-none text-foreground/80">{before.summary.total}</p>
                <p className="mt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Total</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">After</p>
            <span className="text-xs font-mono text-muted-foreground/60">{fmtDate(after.timestamp)}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-[132px_1fr] lg:items-stretch">
            <div className="flex min-h-[92px] flex-col justify-center rounded-[12px] border border-border/80 bg-muted/20 px-4 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Score</p>
              <div className="mt-2 flex items-end gap-2">
                <span className={cn("text-4xl font-black tabular-nums leading-none", scoreTone(after.summary.score))}>
                  {after.summary.score}
                </span>
                <span className="pb-1 text-sm font-mono text-muted-foreground">/100</span>
              </div>
            </div>
            <div className="grid min-h-[92px] grid-cols-3 divide-x divide-border overflow-hidden rounded-[12px] border border-border/80 bg-muted/20">
              <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                <p className="text-xl font-black leading-none text-emerald-400">
                  {after.summary.passed}
                  {passDelta !== 0 && <span className={cn("ml-1 text-xs font-bold", passDeltaTone)}>{signed(passDelta)}</span>}
                </p>
                <p className="mt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Pass</p>
              </div>
              <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                <p className="text-xl font-black leading-none text-rose-400">
                  {after.summary.failed}
                  {failDelta !== 0 && <span className={cn("ml-1 text-xs font-bold", failDeltaTone)}>{signed(failDelta)}</span>}
                </p>
                <p className="mt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Fail</p>
              </div>
              <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                <p className="text-xl font-black leading-none text-emerald-400">{fixedRules.length}</p>
                <p className="mt-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Fixed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4">
        {fixedRules.length === 0 && regressedRules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rule status changes from the previous audit.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                Fixed rules ({fixedRules.length})
              </div>
              {fixedRules.length > 0 ? (
                <div className="space-y-2">
                  {fixedRules.slice(0, 5).map(result => (
                    <div key={result.rule.id} className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
                      <span className="font-mono text-xs font-black text-emerald-400">{result.rule.id}</span>
                      <span className="min-w-0 truncate text-sm text-muted-foreground">{result.rule.title}</span>
                    </div>
                  ))}
                  {fixedRules.length > 5 && (
                    <p className="text-xs text-muted-foreground">+{fixedRules.length - 5} more fixed rules.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No rules have been fixed yet.</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-rose-400">
                <ShieldX className="h-4 w-4" />
                Regressed rules ({regressedRules.length})
              </div>
              {regressedRules.length > 0 ? (
                <div className="space-y-2">
                  {regressedRules.slice(0, 5).map(result => (
                    <div key={result.rule.id} className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
                      <span className="font-mono text-xs font-black text-rose-400">{result.rule.id}</span>
                      <span className="min-w-0 truncate text-sm text-muted-foreground">{result.rule.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No rules regressed from pass to fail.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CIS PDF Viewer ───────────────────────────────────────────────────────────

type PdfState = { blobUrl: string | null; isLoading: boolean };
type PdfAction = { type: "start" } | { type: "done"; url: string } | { type: "fail" };

function pdfReducer(_: PdfState, action: PdfAction): PdfState {
  if (action.type === "start") return { blobUrl: null, isLoading: true };
  if (action.type === "done") return { blobUrl: action.url, isLoading: false };
  return { blobUrl: null, isLoading: false };
}

function usePdfBlobUser(docId: string | undefined) {
  const [{ blobUrl, isLoading }, dispatch] = useReducer(pdfReducer, {
    blobUrl: null,
    isLoading: false,
  });

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    dispatch({ type: "start" });
    getOrFetchPdfBlob(docId, "/documents/file")
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        dispatch({ type: "done", url: objectUrl });
      })
      .catch(() => { if (!cancelled) dispatch({ type: "fail" }); });
    return () => {
      cancelled = true;
      setTimeout(() => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, 2000);
    };
  }, [docId]);

  return { blobUrl, isLoading };
}

function CisPdfDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: doc, isLoading: isDocLoading } = useQuery({
    queryKey: ["user-document"],
    queryFn: userDocumentApi.getCurrent,
    enabled: open,
  });

  const { blobUrl, isLoading: isPdfLoading } = usePdfBlobUser(open && doc?.id ? doc.id : undefined);

  const fmtSize = (b: number) =>
    b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl w-full h-[85vh] p-0 flex flex-col gap-0" showCloseButton={false}>
        <DialogTitle className="sr-only">CIS Docker Benchmark PDF</DialogTitle>
        <DialogDescription className="sr-only">
          Preview the CIS Docker Benchmark document attached to this audit.
        </DialogDescription>
        <div className="h-9 border-b bg-muted/30 px-3 flex items-center gap-2 shrink-0 rounded-t-lg">
          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
            {doc?.name ?? "CIS Docker Benchmark"}
          </span>
          {doc && (
            <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted px-2 py-0.5 rounded-full shrink-0">
              {fmtSize(doc.file_size)}
            </span>
          )}
          <DialogClose className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
            <X className="h-3.5 w-3.5" />
          </DialogClose>
        </div>
        <div className="flex-1 min-h-0">
          {isDocLoading || isPdfLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin" />
              <span className="text-sm">Loading document…</span>
            </div>
          ) : !doc ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-30" />
              <p className="text-sm">No CIS document available</p>
              <p className="text-xs text-muted-foreground/60">Ask admin to upload the CIS Docker Benchmark PDF</p>
            </div>
          ) : blobUrl ? (
            <iframe src={blobUrl} className="w-full h-full border-0 rounded-b-lg" title={doc.name} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-30" />
              <span className="text-sm">Preview unavailable</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AuditDetailSkeleton() {
  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-3 w-3 rounded-full" />
            </div>
            <Skeleton className="h-5 w-72 max-w-[56vw]" />
          </div>
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="space-y-6 p-6">
            <Skeleton className="h-3 w-28" />
            <div className="flex items-end gap-3">
              <Skeleton className="h-20 w-32" />
              <Skeleton className="mb-2 h-7 w-16" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 rounded-[12px]" />
              <Skeleton className="h-24 rounded-[12px]" />
              <Skeleton className="h-24 rounded-[12px]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-14 rounded-[10px]" />
              <Skeleton className="h-14 rounded-[10px]" />
              <Skeleton className="h-14 rounded-[10px]" />
              <Skeleton className="h-14 rounded-[10px]" />
            </div>
          </div>
          <div className="space-y-5 p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-10 w-40 rounded-[10px]" />
            </div>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-9" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 flex-1 rounded-lg" />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function isTimestampAfter(value?: string, reference?: string) {
  if (!value || !reference) return false;
  const valueTime = Date.parse(value);
  const referenceTime = Date.parse(reference);
  return Number.isFinite(valueTime) && Number.isFinite(referenceTime) && valueTime > referenceTime;
}

function isAfterAudit(entry: FixHistoryEntry, audit?: AuditResponse | null) {
  return isTimestampAfter(entry.timestamp, audit?.timestamp);
}

function isFixJobAfterAudit(job: { completedAt?: string; startedAt?: string } | undefined, audit?: { timestamp?: string } | null) {
  return isTimestampAfter(job?.completedAt ?? job?.startedAt, audit?.timestamp);
}

function latestAppliedFixesAfterAudit(history: FixHistoryEntry[], audit?: AuditResponse | null) {
  const latest = new Map<string, FixHistoryEntry>();
  const sorted = [...history].sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
  for (const entry of sorted) {
    const ruleId = entry.request.rule_id;
    if (latest.has(ruleId) || entry.outcome.status !== "Applied" || !isAfterAudit(entry, audit)) continue;
    latest.set(ruleId, entry);
  }
  return latest;
}

function projectedScoreFromFixes(audit: AuditResponse, results: AuditResult[], fixedRuleIds: Set<string>) {
  const fixedFailedResults = results.filter(result => result.status === "Fail" && fixedRuleIds.has(result.rule.id));
  const total = audit.summary.total || results.length;
  const projectedPassed = Math.min(total, audit.summary.passed + fixedFailedResults.length);
  const projectedFailed = Math.max(0, audit.summary.failed - fixedFailedResults.length);
  const projectedScore = total > 0 ? Math.round((projectedPassed / total) * 100) : audit.summary.score;

  return {
    fixedCount: fixedFailedResults.length,
    fixedRuleIds: fixedFailedResults.map(result => result.rule.id),
    projectedPassed,
    projectedFailed,
    projectedScore,
    scoreDelta: projectedScore - audit.summary.score,
  };
}

function fixedFailedResults(results: AuditResult[], fixedRuleIds: Set<string>) {
  return results.filter(result => result.status === "Fail" && fixedRuleIds.has(result.rule.id));
}

function groupProjectionFromFixes(
  results: AuditResult[],
  fixedRuleIds: Set<string>,
  keyForResult: (result: AuditResult) => string,
) {
  const projections = new Map<string, { fixedCount: number; ruleIds: string[] }>();
  for (const result of fixedFailedResults(results, fixedRuleIds)) {
    const key = keyForResult(result);
    const projection = projections.get(key) ?? { fixedCount: 0, ruleIds: [] };
    projection.fixedCount += 1;
    projection.ruleIds.push(result.rule.id);
    projections.set(key, projection);
  }
  return projections;
}

function scoreBarColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#f43f5e";
}

function progressBarColor(percent: number) {
  if (percent === 100) return "#10b981";
  if (percent >= 50) return "#f59e0b";
  return "#f43f5e";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugifyFilePart(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "audit";
}

function formatDocumentDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreBand(score: number) {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Watch";
  return "Critical";
}

function statusClass(status: AuditResult["status"]) {
  if (status === "Pass") return "pass";
  if (status === "Fail") return "fail";
  return "error";
}

function severityClass(severity: string) {
  if (severity === "High") return "high";
  if (severity === "Medium") return "medium";
  return "low";
}

function buildAuditDocumentStem(audit: AuditResponse) {
  const date = new Date(audit.timestamp);
  const stamp = Number.isNaN(date.getTime()) ? "audit" : date.toISOString().slice(0, 10);
  return `dokuru-audit-${slugifyFilePart(audit.hostname)}-${stamp}`;
}

function buildAuditDocumentFilename(audit: AuditResponse) {
  return `${buildAuditDocumentStem(audit)}.html`;
}

function buildAuditDocumentPrintPath(audit: AuditResponse) {
  return `/audit-reports/${buildAuditDocumentStem(audit)}`;
}

function downloadHtmlDocument(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function withPrintBootstrap(html: string, displayPath: string) {
  const script = `
    <script>
      (() => {
        const displayPath = ${JSON.stringify(displayPath)};
        let printed = false;

        try {
          const origin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "";
          if (origin && displayPath.startsWith("/")) {
            window.history.replaceState(null, document.title, origin + displayPath);
          }
        } catch (_) {}

        const printWhenVisible = () => {
          if (printed || document.visibilityState !== "visible") return;
          printed = true;
          document.removeEventListener("visibilitychange", printWhenVisible);
          window.setTimeout(() => window.print(), 250);
        };

        if (document.readyState === "complete") printWhenVisible();
        else window.addEventListener("load", printWhenVisible, { once: true });
        document.addEventListener("visibilitychange", printWhenVisible);
      })();
    </script>`;

  return html.replace("</body>", `${script}\n</body>`);
}

function openPrintableDocument(html: string, displayPath: string) {
  const blobUrl = URL.createObjectURL(new Blob([withPrintBootstrap(html, displayPath)], { type: "text/html;charset=utf-8" }));
  const reportWindow = window.open(blobUrl, "_blank");
  if (!reportWindow) {
    URL.revokeObjectURL(blobUrl);
    throw new Error("Popup blocked");
  }

  reportWindow.focus();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
}

function buildAuditDocumentHtml({
  audit,
  agent,
  results,
  sectionSummaries,
  pillarSummaries,
  remediationPlan,
  appliedFixes,
  projectedFixScore,
  previousAudit,
}: {
  audit: AuditResponse;
  agent: Agent | null;
  results: AuditResult[];
  sectionSummaries: AuditGroupSummary[];
  pillarSummaries: AuditGroupSummary[];
  remediationPlan: AuditRemediationPlan;
  appliedFixes: Map<string, FixHistoryEntry>;
  projectedFixScore: ReturnType<typeof projectedScoreFromFixes> | null;
  previousAudit: AuditResponse | null;
}) {
  const failedResults = results.filter(result => result.status === "Fail");
  const passedResults = results.filter(result => result.status === "Pass");
  const errorResults = results.filter(result => result.status === "Error");
  const generatedAt = new Date();
  const scoreColor = scoreBarColor(audit.summary.score);
  const projectedScore = projectedFixScore && projectedFixScore.fixedCount > 0 ? projectedFixScore.projectedScore : null;
  const projectedWidth = projectedScore && projectedScore > audit.summary.score ? projectedScore : audit.summary.score;
  const scoreBridge = projectedScore && projectedScore > audit.summary.score
    ? `linear-gradient(90deg, ${scoreColor} 0%, ${scoreColor} ${Math.max(0, (audit.summary.score / projectedScore) * 100 - 8)}%, #2496ed ${Math.min(100, (audit.summary.score / projectedScore) * 100 + 8)}%, #2496ed 100%)`
    : scoreColor;
  const topRisks = remediationPlan.actions.slice(0, 8);
  const appliedEntries = [...appliedFixes.values()].sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
  const projectedRuleIds = new Set(projectedFixScore?.fixedRuleIds ?? []);
  const pillarProjections = groupProjectionFromFixes(results, projectedRuleIds, result => getRulePillar(result.rule.id));
  const sectionProjections = groupProjectionFromFixes(results, projectedRuleIds, result => result.rule.section);

  const summaryCard = (label: string, value: string | number, tone: string) => `
    <div class="metric ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;

  const groupRows = (groups: AuditGroupSummary[], projections: Map<string, { fixedCount: number; ruleIds: string[] }>) => groups.map(group => {
    const projection = projections.get(group.key);
    const projectedPassed = Math.min(group.total, group.passed + (projection?.fixedCount ?? 0));
    const projectedPercent = group.total > 0 ? Math.round((projectedPassed / group.total) * 100) : 0;
    return `
    <tr>
      <td>${escapeHtml(group.label)}${projection ? `<br><span class="gain">+${escapeHtml(projection.fixedCount)} fixed: ${escapeHtml(projection.ruleIds.join(", "))}</span>` : ""}</td>
      <td>${escapeHtml(group.passed)}/${escapeHtml(group.total)}${projection ? ` → ${escapeHtml(projectedPassed)}/${escapeHtml(group.total)}` : ""}</td>
      <td>${escapeHtml(group.failed)}</td>
      <td>
        <div class="mini-bar"><span style="width:${projection ? projectedPercent : group.percent}%;${projection ? `background:linear-gradient(90deg, var(--brand-fail) 0%, var(--brand-fail) 72%, var(--brand) 100%)` : ""}"></span></div>
      </td>
      <td class="num">${escapeHtml(group.percent)}%</td>
    </tr>
  `;
  }).join("");

  const riskRows = topRisks.length > 0 ? topRisks.map(action => `
    <tr>
      <td class="rank">${escapeHtml(action.rank)}</td>
      <td><strong>${escapeHtml(action.rule_id)}</strong><br><span>${escapeHtml(action.title)}</span></td>
      <td><span class="pill ${severityClass(action.severity)}">${escapeHtml(action.severity)}</span></td>
      <td>${escapeHtml(action.pillar_label)}</td>
      <td>${escapeHtml(action.remediation_kind)}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="empty">No failed checks in this audit.</td></tr>`;

  const appliedRows = appliedEntries.length > 0 ? appliedEntries.map(entry => `
    <tr>
      <td><strong>${escapeHtml(entry.request.rule_id)}</strong></td>
      <td>${escapeHtml(formatDocumentDate(entry.timestamp))}</td>
      <td><span class="pill pass">${escapeHtml(entry.outcome.status)}</span></td>
      <td>${escapeHtml(entry.outcome.message)}</td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="empty">No applied fixes were recorded after this audit timestamp.</td></tr>`;

  const ruleRows = results.map(result => `
    <tr class="rule-row ${statusClass(result.status)}">
      <td><strong>${escapeHtml(result.rule.id)}</strong></td>
      <td>
        <strong>${escapeHtml(result.rule.title)}</strong>
        <p>${escapeHtml(result.message)}</p>
      </td>
      <td><span class="pill ${statusClass(result.status)}">${escapeHtml(result.status)}</span></td>
      <td><span class="pill ${severityClass(result.rule.severity)}">${escapeHtml(result.rule.severity)}</span></td>
      <td>${escapeHtml(result.affected.length || "-")}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dokuru Audit Report - ${escapeHtml(audit.hostname)}</title>
  <style>
    :root { --ink:#111827; --muted:#6b7280; --line:#d9dee7; --soft:#f5f7fb; --brand:#2496ed; --brand-fail:#e11d48; --pass:#059669; --fail:#e11d48; --warn:#d97706; color-scheme: light; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; background: #e9edf3; color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .page { max-width: 980px; margin: 24px auto; background: #fff; border: 1px solid var(--line); box-shadow: 0 24px 70px rgba(15,23,42,.12); }
    .hero { padding: 32px 42px 28px; color: white; background: radial-gradient(circle at 12% 0%, rgba(36,150,237,.45), transparent 32%), linear-gradient(135deg, #0b1220 0%, #111827 55%, #172033 100%); }
    .brand { display:flex; align-items:center; justify-content:space-between; gap:24px; color:#cbd5e1; font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
    .hero h1 { margin: 24px 0 8px; font-size: 40px; line-height: 1; letter-spacing: -.04em; }
    .hero p { margin: 0; color: #b9c4d4; font-size: 15px; }
    .hero-grid { display:grid; grid-template-columns: 190px 1fr; gap:24px; margin-top:26px; align-items:end; }
    .score { display:inline-flex; align-items:flex-end; gap:10px; white-space:nowrap; font-size: 72px; line-height: .85; font-weight: 950; letter-spacing:-.05em; color:${scoreColor}; }
    .score small { flex:none; padding-bottom:6px; color: rgba(255,255,255,.35); font-size: 28px; line-height:1; letter-spacing:-.02em; }
    .score-band { display:inline-flex; margin-top:10px; border:1px solid rgba(255,255,255,.18); border-radius:999px; padding:6px 10px; color:#dbeafe; font-size:12px; font-weight:800; }
    .score-track { height: 12px; border-radius:999px; background:rgba(255,255,255,.1); overflow:hidden; }
    .score-fill { height:100%; width:${projectedWidth}%; border-radius:999px; background:${scoreBridge}; }
    .projected { display:flex; align-items:center; justify-content:space-between; gap:18px; margin-top:13px; color:#bfdbfe; font-size:13px; }
    .projected strong { color:#7dd3fc; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .content { padding: 28px 42px 38px; }
    .metrics { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:12px; margin-bottom:24px; }
    .metric { border:1px solid var(--line); border-radius:16px; padding:14px; background:var(--soft); }
    .metric span { display:block; color:var(--muted); font-size:11px; font-weight:900; letter-spacing:.16em; text-transform:uppercase; }
    .metric strong { display:block; margin-top:8px; font-size:28px; line-height:1; }
    .metric.pass strong { color:var(--pass); } .metric.fail strong { color:var(--fail); } .metric.warn strong { color:var(--warn); }
    .section { margin-top:26px; break-inside: avoid; }
    .section h2 { margin:0 0 6px; font-size:20px; letter-spacing:-.03em; }
    .section .lead { margin:0 0 12px; color:var(--muted); font-size:13px; }
    table { width:100%; border-collapse:collapse; font-size:12px; }
    th { text-align:left; color:var(--muted); font-size:10px; letter-spacing:.14em; text-transform:uppercase; border-bottom:1px solid var(--line); padding:8px 7px; }
    td { border-bottom:1px solid #edf0f5; padding:9px 7px; vertical-align:top; }
    td p { margin:5px 0 0; color:var(--muted); line-height:1.45; }
    .rank { width:44px; color:var(--muted); font-weight:900; }
    .num { text-align:right; color:var(--muted); font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
    .mini-bar { height:8px; border-radius:999px; background:#eef2f7; overflow:hidden; min-width:120px; }
    .mini-bar span { display:block; height:100%; border-radius:999px; background:var(--brand); }
    .gain { display:inline-block; margin-top:3px; color:var(--brand); font-size:10px; font-weight:800; }
    .pill { display:inline-flex; border-radius:999px; padding:4px 8px; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; border:1px solid transparent; }
    .pill.pass { color:#047857; background:#ecfdf5; border-color:#a7f3d0; } .pill.fail { color:#be123c; background:#fff1f2; border-color:#fecdd3; } .pill.error { color:#b45309; background:#fffbeb; border-color:#fde68a; }
    .pill.high { color:#be123c; background:#fff1f2; border-color:#fecdd3; } .pill.medium { color:#b45309; background:#fffbeb; border-color:#fde68a; } .pill.low { color:#475569; background:#f1f5f9; border-color:#cbd5e1; }
    .rule-row.fail td:first-child { color:var(--fail); } .rule-row.pass td:first-child { color:var(--pass); }
    .empty { color:var(--muted); font-style:italic; text-align:center; padding:22px 8px; }
    .footer { margin-top:28px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:11px; display:flex; justify-content:space-between; gap:20px; }
    @media print {
      @page { size: A4; margin: 0; }
      html, body { background:#fff; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { width:210mm; margin:0; max-width:none; border:0; box-shadow:none; }
      .hero { padding:13mm 15mm 11mm; }
      .hero h1 { margin-top:9mm; font-size:34px; }
      .hero-grid { grid-template-columns: 44mm 1fr; gap:10mm; margin-top:9mm; }
      .score { font-size:62px; }
      .content { padding:10mm 15mm 12mm; }
      .metrics { margin-bottom:8mm; }
      .metric { padding:4mm; }
      .section { margin-top:8mm; break-inside:avoid; }
      th { padding:2.5mm 2mm; }
      td { padding:2.8mm 2mm; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="brand"><span>Dokuru Security Audit</span><span>CIS Docker Benchmark v1.8.0</span></div>
      <h1>${escapeHtml(agent?.name ?? "Docker Agent")}</h1>
      <p>${escapeHtml(audit.hostname)} &middot; Docker ${escapeHtml(audit.docker_version)} &middot; ${escapeHtml(formatDocumentDate(audit.timestamp))}</p>
      <div class="hero-grid">
        <div>
          <div class="score">${escapeHtml(audit.summary.score)}<small>/100</small></div>
          <span class="score-band">${escapeHtml(scoreBand(audit.summary.score))}</span>
        </div>
        <div>
          <div class="score-track"><div class="score-fill"></div></div>
          <div class="projected">
            <span>${projectedScore ? `Projected after applied fixes: <strong>~${escapeHtml(projectedScore)}/100</strong>` : "No post-audit fixes included in this report."}</span>
            <span>${escapeHtml(audit.summary.total)} rules audited</span>
          </div>
        </div>
      </div>
    </section>
    <section class="content">
      <div class="metrics">
        ${summaryCard("Passed", passedResults.length, "pass")}
        ${summaryCard("Failed", failedResults.length, "fail")}
        ${summaryCard("Errors", errorResults.length, "warn")}
        ${summaryCard("Containers", audit.total_containers, "")}
      </div>

      <section class="section">
        <h2>Executive Summary</h2>
        <p class="lead">Snapshot of the host security posture at audit time, with remediation forecast separated from verified score.</p>
        <table>
          <tbody>
            <tr><th>Host</th><td>${escapeHtml(audit.hostname)}</td><th>Agent</th><td>${escapeHtml(agent?.name ?? "Unknown")}</td></tr>
            <tr><th>Audit ID</th><td>${escapeHtml(audit.id ?? "unsaved")}</td><th>Generated</th><td>${escapeHtml(formatDocumentDate(generatedAt))}</td></tr>
            <tr><th>Previous score</th><td>${escapeHtml(previousAudit ? `${previousAudit.summary.score}/100` : "Not available")}</td><th>Rerun estimate</th><td>${projectedScore ? `~${escapeHtml(projectedScore)}/100` : "No post-audit fixes"}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>Security Pillars</h2>
        <p class="lead">Control coverage grouped by Dokuru security area.</p>
        <table><thead><tr><th>Pillar</th><th>Pass</th><th>Fail</th><th>Coverage</th><th></th></tr></thead><tbody>${groupRows(pillarSummaries, pillarProjections)}</tbody></table>
      </section>

      <section class="section">
        <h2>CIS Sections</h2>
        <p class="lead">Benchmark sections sorted as rendered in the audit result.</p>
        <table><thead><tr><th>Section</th><th>Pass</th><th>Fail</th><th>Coverage</th><th></th></tr></thead><tbody>${groupRows(sectionSummaries, sectionProjections)}</tbody></table>
      </section>

      <section class="section">
        <h2>Remediation Priorities</h2>
        <p class="lead">Highest impact failed checks to handle first. Auto-fix means Dokuru has an agent-side remediation path.</p>
        <table><thead><tr><th>#</th><th>Rule</th><th>Severity</th><th>Pillar</th><th>Mode</th></tr></thead><tbody>${riskRows}</tbody></table>
      </section>

      <section class="section">
        <h2>Applied Fixes After This Audit</h2>
        <p class="lead">These fixes are recorded after the audit timestamp. Re-run audit to turn estimates into verified score.</p>
        <table><thead><tr><th>Rule</th><th>Time</th><th>Status</th><th>Outcome</th></tr></thead><tbody>${appliedRows}</tbody></table>
      </section>

      <section class="section">
        <h2>Full Rule Results</h2>
        <p class="lead">Complete rule inventory from this audit run.</p>
        <table><thead><tr><th>Rule</th><th>Finding</th><th>Status</th><th>Severity</th><th>Affected</th></tr></thead><tbody>${ruleRows}</tbody></table>
      </section>

      <div class="footer"><span>Generated by Dokuru</span><span>Open this HTML and use Print / Save as PDF for a PDF copy.</span></div>
    </section>
  </main>
</body>
</html>`;
}

// ── Main Page ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "Pass" | "Fail" | "Error";
type ViewMode = "pillar" | "section";

function AuditDetailPage() {
  const { id, auditId } = Route.useParams();
  const { ruleId: focusedRuleId } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const markAuditResultViewed = useAuditStore((state) => state.markAuditResultViewed);
  const hydrateFixJobFromHistory = useAuditStore((state) => state.hydrateFixJobFromHistory);
  const storedAuditHistory = useAuditStore((state) => state.auditHistories[id]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [pillarFilter, setPillarFilter] = useState<SecurityPillar | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("pillar");
  const [documentExporting, setDocumentExporting] = useState<"html" | "pdf" | null>(null);
  const fixJobs = useAuditStore((state) => state.fixJobs);

  const agentQuery = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
    staleTime: 30_000,
  });
  const agent = agentQuery.data ?? null;
  const token = agent ? dockerCredential(agent) || undefined : undefined;

  const auditQuery = useQuery({
    queryKey: ["audit", id, auditId],
    queryFn: () => agentApi.getAuditById(id, auditId),
    initialData: () => {
      const cachedAudit = queryClient.getQueryData<AuditResponse>(["audit", id, auditId]);
      if (cachedAudit) return cachedAudit;
      const cachedHistory = queryClient.getQueryData<AuditResponse[]>(["audits", id]) ?? storedAuditHistory ?? [];
      return cachedHistory.find((audit) => audit.id === auditId);
    },
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
  const auditData = auditQuery.data ?? null;

  const auditReportQuery = useQuery({
    queryKey: ["audit-report", id, auditId],
    queryFn: () => agentApi.getAuditReport(id, auditId),
    enabled: !!auditData,
    retry: false,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
  const auditReport = auditReportQuery.data ?? null;

  const auditHistoryQuery = useQuery({
    queryKey: ["audits", id],
    queryFn: () => agentApi.listAudits(id),
    initialData: () => {
      const cachedHistory = queryClient.getQueryData<AuditResponse[]>(["audits", id]);
      if (cachedHistory?.length) return cachedHistory;
      return storedAuditHistory?.length ? storedAuditHistory : undefined;
    },
    staleTime: 60_000,
  });
  const auditHistory = auditHistoryQuery.data ?? storedAuditHistory ?? [];

  const containersQuery = useQuery({
    queryKey: ["containers", id, true],
    queryFn: async () => {
      if (!agent) return [];
      const response = await dockerApi.listContainers(agent.url, dockerCredential(agent), true);
      return response.data;
    },
    enabled: canUseDockerAgent(agent),
    staleTime: 10_000,
  });
  const containers = containersQuery.data ?? [];
  const auditScrollStorageKey = auditDetailScrollKey(id, auditId);

  const {
    open: wizardOpen,
    step: wizardStep,
    outcome: wizardOutcome,
    preview: wizardPreview,
    previewLoading: wizardPreviewLoading,
    targetConfig: wizardTargetConfig,
    progressEvents: wizardProgressEvents,
    stepIndex: wizardStepIndex,
    activeResult: wizardResult,
    openWizard,
    closeWizard,
    applyFix,
    updateTargetConfig,
  } = useFix({
    agentId: id,
    agentUrl: agent?.url ?? "",
    agentAccessMode: agent?.access_mode,
    token,
  });

  const {
    open: fixAllOpen,
    step: fixAllStep,
    currentIndex: fixAllIndex,
    ruleStatuses,
    selectedCount: fixAllSelectedCount,
    cgroupTargets: fixAllCgroupTargets,
    cgroupLoading: fixAllCgroupLoading,
    selectedCgroupRuleIds: fixAllSelectedCgroupRuleIds,
    openFixAll,
    closeFixAll,
    applyAll,
    toggleRule: toggleFixAllRule,
    setAllSelected: setAllFixAllSelected,
    updateCgroupTarget: updateFixAllCgroupTarget,
    backToConfirm: backFixAllToConfirm,
  } = useFixAll({
    agentId: id,
    agentUrl: agent?.url ?? "",
    agentAccessMode: agent?.access_mode,
    token,
  });

  const fixHistoryQuery = useQuery({
    queryKey: ["fix-history", agent?.access_mode, id, agent?.url ?? "", token],
    enabled: !!agent && (agent.access_mode === "relay" || (!!agent.url && (!!token || agent.id === LOCAL_AGENT_ID))),
    queryFn: async () => {
      if (!agent) return [];
      return agent.access_mode === "relay"
        ? await agentApi.listFixHistory(id)
        : await agentDirectApi.listFixHistory(agent.url, token);
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    markAuditResultViewed(id, auditId);
  }, [auditId, id, markAuditResultViewed]);

  useEffect(() => {
    if (!auditQuery.isError) return;
    console.error("Failed to load audit:", auditQuery.error);
    toast.error("Failed to load audit");
  }, [auditQuery.error, auditQuery.isError]);

  useEffect(() => {
    if (!auditReportQuery.isError) return;
    console.warn("Failed to load Rust audit report, using client fallback:", auditReportQuery.error);
  }, [auditReportQuery.error, auditReportQuery.isError]);

  useEffect(() => {
    if (!auditHistoryQuery.isError) return;
    console.warn("Failed to load audit history for comparison:", auditHistoryQuery.error);
  }, [auditHistoryQuery.error, auditHistoryQuery.isError]);

  useEffect(() => {
    if (!containersQuery.isError) return;
    console.warn("Failed to load containers for affected links:", containersQuery.error);
  }, [containersQuery.error, containersQuery.isError]);

  useEffect(() => {
    if (!auditData || focusedRuleId) return;
    const savedScrollY = readSavedWindowScrollY(auditScrollStorageKey);
    if (savedScrollY <= 0) return;

    let secondFrameId: number | null = null;
    const firstFrameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedScrollY });
      secondFrameId = window.requestAnimationFrame(() => window.scrollTo({ top: savedScrollY }));
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId !== null) window.cancelAnimationFrame(secondFrameId);
    };
  }, [auditData, auditScrollStorageKey, focusedRuleId]);

  useEffect(() => {
    let frameId: number | null = null;
    const saveScroll = () => writeSavedWindowScrollY(auditScrollStorageKey, window.scrollY);
    const handleScroll = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        saveScroll();
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", saveScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", saveScroll);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      saveScroll();
    };
  }, [auditScrollStorageKey]);

  const previousAudit = auditData ? (() => {
    const sortedHistory = [...auditHistory].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    const currentIndex = sortedHistory.findIndex(audit => audit.id && audit.id === auditData.id);
    if (currentIndex >= 0) return sortedHistory[currentIndex + 1] ?? null;

    const currentTime = Date.parse(auditData.timestamp);
    return sortedHistory.find(audit => audit.id !== auditData.id && Date.parse(audit.timestamp) < currentTime) ?? null;
  })() : null;

  const report = auditReport?.report;
  const baseResults = sortAuditResults(report?.sorted_results?.length ? report.sorted_results : auditData?.results ?? []);
  const appliedHistoryByRule = latestAppliedFixesAfterAudit(fixHistoryQuery.data ?? [], auditData);
  const fixedRuleIds = new Set<string>(appliedHistoryByRule.keys());
  for (const result of baseResults) {
    const ruleId = result.rule.id;
    const job = fixJobs[fixJobKey(id, ruleId)];
    if (job?.status === "applied" && isFixJobAfterAudit(job, auditData)) fixedRuleIds.add(ruleId);
  }
  const projectedFixScore = auditData ? projectedScoreFromFixes(auditData, baseResults, fixedRuleIds) : null;
  const hasProjectedFixes = (projectedFixScore?.fixedCount ?? 0) > 0;
  const fixedResultPreviews = fixedFailedResults(baseResults, fixedRuleIds);
  const pillarProjections = groupProjectionFromFixes(baseResults, fixedRuleIds, result => getRulePillar(result.rule.id));
  const sectionProjections = groupProjectionFromFixes(baseResults, fixedRuleIds, result => result.rule.section);
  const sectionSummaries = groupSummariesFromResults(baseResults, result => result.rule.section, key => key);
  const sections = sectionSummaries.map(section => section.key);
  const sectionStats: Record<string, { total: number; passed: number; percent: number }> = Object.fromEntries(sectionSummaries.map(section => [
    section.key,
    { total: section.total, passed: section.passed, percent: section.percent },
  ]));

  // Sort sections: worst pass% first, so problem areas appear at top
  const sortedSections = [...sections].sort((a, b) => {
    const statA = sectionStats[a] ?? { total: 0, passed: 0 };
    const statB = sectionStats[b] ?? { total: 0, passed: 0 };
    const pctA = statA.total > 0 ? statA.passed / statA.total : 1;
    const pctB = statB.total > 0 ? statB.passed / statB.total : 1;
    return pctA - pctB;
  });

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const scopedResults = baseResults.filter(r => {
    const sectionOk = sectionFilter === "all" || r.rule.section === sectionFilter;
    const pillarOk = pillarFilter === "all" || getRulePillar(r.rule.id) === pillarFilter;
    const searchOk = !normalizedSearchQuery ||
      r.rule.id.toLowerCase().includes(normalizedSearchQuery) ||
      r.rule.title.toLowerCase().includes(normalizedSearchQuery) ||
      r.message.toLowerCase().includes(normalizedSearchQuery);
    return sectionOk && pillarOk && searchOk;
  });

  const statusCounts = {
    failed: scopedResults.filter(r => r.status === "Fail").length,
    passed: scopedResults.filter(r => r.status === "Pass").length,
    errors: scopedResults.filter(r => r.status === "Error").length,
    total: scopedResults.length,
  };

  const filteredResults = scopedResults.filter(r => statusFilter === "all" || r.status === statusFilter);

  const pillarSummaries = groupSummariesFromResults(
    baseResults,
    result => getRulePillar(result.rule.id),
    key => PILLAR_META[key as SecurityPillar]?.name ?? key,
  ).sort((a, b) => {
    const order = Object.keys(PILLAR_META);
    return order.indexOf(a.key) - order.indexOf(b.key);
  });
  const severityFailures = {
    high: baseResults.filter(r => r.rule.severity === "High" && r.status === "Fail").length,
    medium: baseResults.filter(r => r.rule.severity === "Medium" && r.status === "Fail").length,
  };
  const remediationPlan = buildRemediationPlan(baseResults);

  // Group filtered results by section OR pillar based on viewMode
  const groupedResults = viewMode === "section"
    ? filteredResults.reduce<Record<string, AuditResult[]>>((acc, r) => {
      (acc[r.rule.section] ??= []).push(r);
      return acc;
    }, {})
    : filteredResults.reduce<Record<string, AuditResult[]>>((acc, r) => {
      const pillar = getRulePillar(r.rule.id);
      const pillarName = PILLAR_META[pillar].name;
      (acc[pillarName] ??= []).push(r);
      return acc;
    }, {});

  const fmtDate = (ts: string) => {
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({ to: "/agents/$id/audits", params: { id } });
  };

  const buildCurrentAuditDocumentHtml = () => {
    if (!auditData) return null;
    return buildAuditDocumentHtml({
      audit: auditData,
      agent,
      results: baseResults,
      sectionSummaries,
      pillarSummaries,
      remediationPlan,
      appliedFixes: appliedHistoryByRule,
      projectedFixScore,
      previousAudit,
    });
  };

  const handleExportDocument = (format: "html" | "pdf") => {
    if (!auditData || documentExporting) return;
    setDocumentExporting(format);
    try {
      const html = buildCurrentAuditDocumentHtml();
      if (!html) return;
      if (format === "html") {
        downloadHtmlDocument(buildAuditDocumentFilename(auditData), html);
        toast.success("Audit HTML report downloaded");
      } else {
        openPrintableDocument(html, buildAuditDocumentPrintPath(auditData));
        toast.success("Report tab opened", {
          description: "Print opens when the report tab is active. Choose Save as PDF there.",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to build audit document");
    } finally {
      setDocumentExporting(null);
    }
  };

  useEffect(() => {
    if (!auditData || !fixHistoryQuery.data?.length) return;
    const appliedFixes = latestAppliedFixesAfterAudit(fixHistoryQuery.data, auditData);
    for (const entry of appliedFixes.values()) {
      hydrateFixJobFromHistory(id, entry);
    }
  }, [auditData, fixHistoryQuery.data, hydrateFixJobFromHistory, id]);

  if (auditQuery.isLoading && !auditData) {
    return <AuditDetailSkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-10">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Security Audit</h2>
          <p className="text-muted-foreground text-sm mt-0.5">CIS Docker Benchmark v1.8.0</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-w-[150px]"
                disabled={!auditData || !!documentExporting}
              >
                {documentExporting ? (
                  <>
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-24" />
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Export Report
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit min-w-0">
              <DropdownMenuLabel className="whitespace-nowrap pr-4">Document Format</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="whitespace-nowrap pr-4" onClick={() => handleExportDocument("pdf")}>
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </DropdownMenuItem>
              <DropdownMenuItem className="whitespace-nowrap pr-4" onClick={() => handleExportDocument("html")}>
                <Download className="h-4 w-4" />
                Download HTML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
      </div>

      {auditData ? (
        <>
          {/* ── Summary Card ────────────────────────────────── */}
          <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-muted/20 px-5 py-3 dark:bg-[#111111]/90">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex shrink-0 items-center gap-2" aria-hidden="true">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[0_0_14px_rgba(255,95,87,0.45)]" />
                    <span className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-[0_0_14px_rgba(255,189,46,0.35)]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-[0_0_14px_rgba(40,200,64,0.35)]" />
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-base">
                    <span className="truncate font-semibold tracking-tight text-foreground">
                      {agent?.name ?? id}
                    </span>
                    <span className="shrink-0 text-muted-foreground/55">/</span>
                    <span className="truncate font-mono font-semibold text-primary">
                      {auditData.hostname}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="font-mono font-medium">
                    {fmtDate(auditData.timestamp).split(",")[1]?.trim() ?? fmtDate(auditData.timestamp)}
                  </span>
                </div>
              </div>
            </div>

            {/* Body: score left + breakdown right */}
            <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
              {/* Left: Score + stats */}
              <div className="flex flex-col p-5 md:p-6">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Audit Score</p>
                    {hasProjectedFixes && projectedFixScore && (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2496ED]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Rerun estimate</span>
                        <span className="font-mono text-sm tracking-normal">~{projectedFixScore.projectedScore}</span>
                        {projectedFixScore.scoreDelta > 0 && (
                          <span className="rounded-full bg-[#2496ED]/10 px-1.5 py-0.5 font-mono text-[10px] tracking-normal">+{projectedFixScore.scoreDelta}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className={cn("text-7xl font-black tabular-nums leading-none",
                      auditData.summary.score >= 80 ? "text-emerald-400"
                        : auditData.summary.score >= 60 ? "text-amber-400"
                          : "text-rose-400"
                    )}>
                      {auditData.summary.score}
                    </span>
                    <span className="text-xl text-muted-foreground/40 font-bold">/ 100</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted/40 shadow-inner">
                    {projectedFixScore && projectedFixScore.fixedCount > 0 && projectedFixScore.projectedScore > auditData.summary.score ? (
                      <div
                        className="h-full rounded-full shadow-[0_0_16px_rgba(36,150,237,0.35)] transition-all duration-1000 ease-out"
                        style={{
                          width: `${projectedFixScore.projectedScore}%`,
                          background: `linear-gradient(90deg, ${scoreBarColor(auditData.summary.score)} 0%, ${scoreBarColor(auditData.summary.score)} ${Math.max(0, (auditData.summary.score / projectedFixScore.projectedScore) * 100 - 8)}%, #2496ED ${Math.min(100, (auditData.summary.score / projectedFixScore.projectedScore) * 100 + 8)}%, #2496ED 100%)`,
                        }}
                      />
                    ) : (
                      <div
                        className={cn("h-full rounded-full transition-all duration-1000 ease-out",
                          auditData.summary.score >= 80 ? "bg-emerald-500"
                            : auditData.summary.score >= 60 ? "bg-amber-500"
                              : "bg-rose-500"
                        )}
                        style={{ width: `${auditData.summary.score}%` }}
                      />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">CIS Docker Benchmark v1.8.0 · {auditData.summary.total} rules</p>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusFilter(f => f === "Pass" ? "all" : "Pass")}
                    aria-pressed={statusFilter === "Pass"}
                    className={cn(
                      "flex min-h-[84px] flex-col items-center justify-center rounded-[12px] border px-3 py-2.5 text-center transition-all duration-200",
                      statusFilter === "Pass"
                        ? "border-[#00d9a5]/50 bg-[#00d9a5]/10 ring-1 ring-[#00d9a5]/20"
                        : "border-[#00d9a5]/25 bg-[#00d9a5]/5 hover:bg-[#00d9a5]/10 hover:border-[#00d9a5]/35"
                    )}
                  >
                    <span className="flex items-baseline justify-center gap-1.5">
                      <span className="text-3xl font-black leading-none text-[#00d9a5]">{auditData.summary.passed}</span>
                      {hasProjectedFixes && projectedFixScore && (
                        <span className="font-mono text-xs font-bold text-[#00d9a5]">→ {projectedFixScore.projectedPassed}</span>
                      )}
                    </span>
                    <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pass</span>
                    {hasProjectedFixes && projectedFixScore && (
                      <span className="mt-0.5 font-mono text-[10px] font-semibold text-[#00d9a5]/85">+{projectedFixScore.fixedCount} after fixes</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(f => f === "Fail" ? "all" : "Fail")}
                    aria-pressed={statusFilter === "Fail"}
                    className={cn(
                      "flex min-h-[84px] flex-col items-center justify-center rounded-[12px] border px-3 py-2.5 text-center transition-all duration-200",
                      statusFilter === "Fail"
                        ? "bg-rose-500/15 border-rose-500/45 ring-1 ring-rose-500/25"
                        : "bg-rose-500/5 border-rose-500/25 hover:bg-rose-500/10 hover:border-rose-500/35"
                    )}
                  >
                    <span className="flex items-baseline justify-center gap-1.5">
                      <span className="text-3xl font-black leading-none text-rose-400">{auditData.summary.failed}</span>
                      {hasProjectedFixes && projectedFixScore && (
                        <span className="font-mono text-xs font-bold text-rose-300/80">→ {projectedFixScore.projectedFailed}</span>
                      )}
                    </span>
                    <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fail</span>
                    {hasProjectedFixes && projectedFixScore && (
                      <span className="mt-0.5 font-mono text-[10px] font-semibold text-rose-300/75">-{projectedFixScore.fixedCount} after fixes</span>
                    )}
                  </button>
                  <div className="flex min-h-[84px] flex-col items-center justify-center rounded-[12px] border border-border bg-muted/20 px-3 py-2.5 text-center">
                    <span className="block text-3xl font-black leading-none text-foreground/80">{auditData.summary.total}</span>
                    <span className="mt-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</span>
                    <span className="mt-0.5 text-[10px] font-medium text-muted-foreground/60">audited</span>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
                  {[
                    { icon: Server, label: "Host", value: auditData.hostname },
                    { icon: Cpu, label: "Docker", value: auditData.docker_version },
                    { icon: Container, label: "Containers", value: String(auditData.total_containers) },
                    { icon: Clock, label: "Ran", value: fmtDate(auditData.timestamp).split(",")[1]?.trim() ?? fmtDate(auditData.timestamp) },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex min-w-0 items-center gap-2 rounded-[10px] border border-border/80 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/30">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-[0.14em]">{label}</p>
                        <p className="truncate text-sm font-semibold text-foreground/90">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Pillar/Section breakdown with toggle */}
              <div className="flex flex-col p-5 md:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      {viewMode === "pillar" ? "Security Pillars" : "CIS Sections"}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground/70">
                      {viewMode === "pillar" ? "Grouped by security area." : "Grouped by CIS section."}
                    </p>
                  </div>
                  <div className="inline-flex w-fit shrink-0 items-stretch overflow-hidden rounded-[10px] border border-border bg-muted/25">
                    <button
                      type="button"
                      onClick={() => setViewMode("pillar")}
                      aria-pressed={viewMode === "pillar"}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors",
                        viewMode === "pillar" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Pillars
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("section")}
                      aria-pressed={viewMode === "section"}
                      className={cn(
                        "inline-flex items-center gap-1.5 border-l border-border/60 px-3 py-1.5 text-xs font-semibold transition-colors",
                        viewMode === "section" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      Sections
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3.5">
                  {viewMode === "pillar" ? (
                    pillarSummaries.map(pillarSummary => {
                      const pillar = pillarSummary.key as SecurityPillar;
                      const meta = PILLAR_META[pillar];
                      if (!meta) return null;
                      const Icon = meta.icon;
                      const projection = pillarProjections.get(pillar);

                      return (
                        <AuditBreakdownRow
                          key={pillar}
                          leading={<Icon className={cn("h-3.5 w-3.5", meta.color)} />}
                          label={meta.name}
                          total={pillarSummary.total}
                          passed={pillarSummary.passed}
                          fixedCount={projection?.fixedCount}
                          fixedRuleIds={projection?.ruleIds}
                        />
                      );
                    })
                  ) : (
                    sortedSections.map(s => (
                      <SectionHeader key={s} section={s}
                        total={sectionStats[s]?.total ?? 0}
                        passed={sectionStats[s]?.passed ?? 0}
                        fixedCount={sectionProjections.get(s)?.fixedCount}
                        fixedRuleIds={sectionProjections.get(s)?.ruleIds}
                      />
                    ))
                  )}
                </div>

                {/* Quick Stats */}
                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-5">
                  <div className="rounded-[10px] border border-border/80 bg-muted/20 px-3 py-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-[0.14em]">Critical</p>
                    <p className="text-lg font-black text-rose-400">{severityFailures.high}</p>
                  </div>
                  <div className="rounded-[10px] border border-border/80 bg-muted/20 px-3 py-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-[0.14em]">Medium</p>
                    <p className="text-lg font-black text-amber-400">{severityFailures.medium}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {fixedResultPreviews.length > 0 && (
            <div className="rounded-xl border border-[#2496ED]/25 bg-[#2496ED]/5 px-5 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-bold text-[#2496ED]">
                    <ShieldCheck className="h-4 w-4" />
                    Fix impact preview
                    {projectedFixScore && projectedFixScore.scoreDelta > 0 && (
                      <span className="rounded-full bg-[#2496ED]/10 px-2 py-0.5 font-mono text-xs">score +{projectedFixScore.scoreDelta}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    These checks were fixed after this audit. Blue segments show the estimated pass gain if rerun confirms them.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const firstFixedRule = fixedResultPreviews[0];
                    setStatusFilter("Fail");
                    if (!firstFixedRule) return;
                    void navigate({
                      to: "/agents/$id/audits/$auditId",
                      params: { id, auditId },
                      search: { ruleId: firstFixedRule.rule.id },
                    });
                  }}
                  className="shrink-0 border-[#2496ED]/25 text-[#2496ED] hover:text-[#2496ED]"
                >
                  Jump to fixed rules
                </Button>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {fixedResultPreviews.map((result) => {
                  const pillar = getRulePillar(result.rule.id);
                  const meta = PILLAR_META[pillar];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={result.rule.id}
                      type="button"
                      onClick={() => void navigate({
                        to: "/agents/$id/audits/$auditId",
                        params: { id, auditId },
                        search: { ruleId: result.rule.id },
                      })}
                      className="group min-w-[240px] rounded-lg border border-[#2496ED]/20 bg-background/45 px-3 py-2 text-left transition-colors hover:border-[#2496ED]/45 hover:bg-[#2496ED]/10"
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-foreground/80">{result.rule.id}</span>
                        <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                        <span className="truncate text-[11px] font-semibold text-muted-foreground group-hover:text-[#2496ED]">{meta.name}</span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs font-medium text-foreground/85">{result.rule.title}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {previousAudit && (
            <BeforeAfterComparison
              before={previousAudit}
              after={auditData}
              fmtDate={fmtDate}
            />
          )}

          {/* ── Fix All banner ───────────────────────────────── */}
          {(() => {
            const autoFixable = baseResults.filter(result => isAutoFixableResult(result) && !fixedRuleIds.has(result.rule.id));
            if (autoFixable.length === 0) return null;
            return (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#2496ED]/25 bg-[#2496ED]/5 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#2496ED]">
                    {autoFixable.length} rule{autoFixable.length > 1 ? "s" : ""} can be auto-fixed
                  </p>
                  <p className="text-xs text-[#2496ED]/60 mt-0.5">
                    Image config, namespace isolation, cgroup limits, and privileged containers — one click.
                  </p>
                </div>
                <button
                  onClick={() => openFixAll(autoFixable)}
                  className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-[#2496ED] hover:bg-[#1e80cc] px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_-4px_rgba(36,150,237,0.5)] transition-all hover:shadow-[0_0_24px_-4px_rgba(36,150,237,0.7)] active:scale-[0.98]"
                >
                  <Wrench className="h-4 w-4" />
                  Fix All ({autoFixable.length})
                </button>
              </div>
            );
          })()}

          {agent && (
            <FixHistoryPanel
              agentId={id}
              agentUrl={agent.url}
              agentAccessMode={agent.access_mode}
              token={token}
            />
          )}

          {remediationPlan.total_failed ? (
            <div className="rounded-2xl border border-border bg-card dark:bg-gradient-to-br dark:from-[#0A0A0B] dark:to-[#111113] overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="max-w-2xl">
                  <h3 className="text-base font-bold tracking-tight">Remediation Plan</h3>
                  <p className="text-sm text-muted-foreground">
                    Top {Math.min(remediationPlan.actions.length, 5)} of {remediationPlan.total_failed} failed checks from this audit. After a fix and audit rerun, the next failed rule moves into this priority list.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
                    <p className="text-lg font-black text-rose-400">{remediationPlan.high_impact}</p>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">High severity</p>
                  </div>
                  <div className="rounded-lg border border-[#2496ED]/20 bg-[#2496ED]/10 px-3 py-2">
                    <p className="text-lg font-black text-[#2496ED]">{remediationPlan.auto_fixable}</p>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Auto-fixable</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <p className="text-lg font-black text-foreground">{remediationPlan.quick_wins}</p>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Quick fixes</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                    <p className="text-lg font-black text-foreground">{remediationPlan.manual + remediationPlan.guided}</p>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Manual review</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-border">
                {remediationPlan.actions.slice(0, 5).map((action) => {
                  const pillar = action.pillar_key as SecurityPillar;
                  const meta = PILLAR_META[pillar];
                  const effortLabel = action.effort === "quick" ? "Quick" : action.effort === "moderate" ? "Moderate" : "Involved";
                  const kindLabel = action.remediation_kind === "auto" ? "Apply fix" : action.remediation_kind === "guided" ? "Guided" : "Manual";
                  const kindClass = action.remediation_kind === "auto"
                    ? "border-[#2496ED]/25 bg-[#2496ED]/10 text-[#2496ED]"
                    : "border-border bg-muted/30 text-muted-foreground";
                  const scopeLabel = action.affected_count > 0
                    ? `${action.affected_count} affected item${action.affected_count > 1 ? "s" : ""}`
                    : "Host-level check";

                  return (
                    <div key={action.rule_id} className="grid gap-3 px-5 py-4 md:grid-cols-[auto_1fr_auto] md:items-start">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/30 font-mono text-xs font-black text-muted-foreground">
                        {action.rank}
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-black text-muted-foreground bg-muted/40 px-2 py-1 rounded border border-border">
                            {action.rule_id}
                          </span>
                          <SeverityBadge severity={action.severity} />
                          {meta && (
                            <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded border", meta.bg, meta.color, meta.border)}>
                              {action.pillar_label}
                            </span>
                          )}
                          <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-bold", kindClass)}>
                            <Wrench className="h-3 w-3" />
                            {kindLabel}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/30 px-2 py-1 text-xs font-bold text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {effortLabel}
                          </span>
                        </div>
                        <p className="font-semibold leading-snug">{action.title}</p>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{action.summary}</p>
                      </div>
                      <div className="flex items-center md:min-w-[170px] md:justify-end">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs font-bold text-muted-foreground">
                          <Server className="h-3.5 w-3.5 text-muted-foreground/70" />
                          {scopeLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ── Search & Filters ────────────────────────────── */}
          <div className="space-y-2">
            {/* Row 1: Search + view toggle + clear */}
            <div className="flex items-center gap-2">
              <div className="flex items-stretch overflow-hidden border border-border rounded-lg bg-muted/20 shrink-0">
                <button
                  onClick={() => setViewMode("pillar")}
                  className={cn("flex items-center gap-1.5 text-xs px-3 py-2 font-bold transition-all",
                    viewMode === "pillar" ? "bg-[#2496ED] text-white" : "hover:bg-muted/40 text-muted-foreground")}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Pillars
                </button>
                <button
                  onClick={() => setViewMode("section")}
                  className={cn("flex items-center gap-1.5 border-l border-border/60 text-xs px-3 py-2 font-bold transition-all",
                    viewMode === "section" ? "bg-[#2496ED] text-white" : "hover:bg-muted/40 text-muted-foreground")}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  Sections
                </button>
              </div>
              {(statusFilter !== "all" || sectionFilter !== "all" || pillarFilter !== "all" || searchQuery) && (
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    setSectionFilter("all");
                    setPillarFilter("all");
                    setSearchQuery("");
                  }}
                  className="shrink-0 text-xs px-2 py-1.5 text-muted-foreground hover:text-rose-400 font-bold transition-colors"
                >
                  Clear
                </button>
              )}

              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input
                  type="text"
                  placeholder="Search rules by ID, title, or message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-9 bg-muted/20 border-border text-foreground/90 placeholder:text-muted-foreground/60 focus:border-[#2496ED]/50 focus:ring-[#2496ED]/20 text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground/80 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <span className="text-xs text-muted-foreground/60 font-semibold shrink-0">Status:</span>
              <button
                onClick={() => setStatusFilter("all")}
                className={cn("shrink-0 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                  statusFilter === "all" ? "bg-[#2496ED] text-white border-[#2496ED]/50" : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
              >
                All
                <span className="font-mono text-[10px] opacity-70">{statusCounts.total}</span>
              </button>
              <button
                onClick={() => setStatusFilter(f => f === "Fail" ? "all" : "Fail")}
                className={cn("shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                  statusFilter === "Fail" ? "bg-rose-500/10 text-rose-400 border-rose-500/30" : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
              >
                <ShieldX className="h-3 w-3" />
                Needs fix
                <span className="font-mono text-[10px] opacity-70">{statusCounts.failed}</span>
              </button>
              <button
                onClick={() => setStatusFilter(f => f === "Pass" ? "all" : "Pass")}
                className={cn("shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                  statusFilter === "Pass" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
              >
                <ShieldCheck className="h-3 w-3" />
                Passed
                <span className="font-mono text-[10px] opacity-70">{statusCounts.passed}</span>
              </button>
              {statusCounts.errors > 0 && (
                <button
                  onClick={() => setStatusFilter(f => f === "Error" ? "all" : "Error")}
                  className={cn("shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                    statusFilter === "Error" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Error
                  <span className="font-mono text-[10px] opacity-70">{statusCounts.errors}</span>
                </button>
              )}
            </div>

            {/* Row 2: Filter pills — scrollable */}
            {viewMode === "pillar" && (
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                <span className="text-xs text-muted-foreground/60 font-semibold shrink-0">Pillar:</span>
                <button
                  onClick={() => setPillarFilter("all")}
                  className={cn("shrink-0 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                    pillarFilter === "all" ? "bg-[#2496ED] text-white border-[#2496ED]/50" : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
                >
                  All
                </button>
                {(Object.keys(PILLAR_META) as SecurityPillar[]).map(pillar => {
                  const meta = PILLAR_META[pillar];
                  const Icon = meta.icon;
                  return (
                    <button key={pillar}
                      onClick={() => setPillarFilter(f => f === pillar ? "all" : pillar)}
                      className={cn("shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-all",
                        pillarFilter === pillar
                          ? "bg-[#2496ED]/10 text-[#2496ED] border-[#2496ED]/30"
                          : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
                    >
                      <Icon size={12} className={pillarFilter === pillar ? "text-[#2496ED]" : meta.color} />
                      {meta.name}
                    </button>
                  );
                })}
              </div>
            )}

            {viewMode === "section" && (
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                <span className="text-xs text-muted-foreground/60 font-semibold shrink-0">Section:</span>
                <button
                  onClick={() => setSectionFilter("all")}
                  className={cn("shrink-0 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                    sectionFilter === "all" ? "bg-[#2496ED] text-white border-[#2496ED]/50" : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
                >
                  All
                </button>
                {sortedSections.map(s => {
                  const meta = sectionMeta(s);
                  return (
                    <button key={s}
                      onClick={() => setSectionFilter(f => f === s ? "all" : s)}
                      className={cn("shrink-0 text-xs px-3 py-1.5 rounded-lg border font-medium transition-all",
                        sectionFilter === s
                          ? "bg-[#2496ED]/10 text-[#2496ED] border-[#2496ED]/30"
                          : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
                    >
                      {meta.num} {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Results grouped by pillar or section ───────── */}
          {Object.keys(groupedResults).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground/60 text-sm">
              No results match the current filters.
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedResults)
                .filter(([, results]) => results.length > 0) // Only show groups with results
                .map(([groupName, results]) => {
                  // Determine if this is a pillar or section group
                  const isPillarView = viewMode === "pillar";

                  if (isPillarView) {
                    // Pillar view
                    const pillar = (Object.keys(PILLAR_META) as SecurityPillar[]).find(p => PILLAR_META[p].name === groupName);
                    if (!pillar) return null;
                    const meta = PILLAR_META[pillar];
                    const Icon = meta.icon;

                    return (
                      <div key={groupName}>
                        <div className="flex items-center gap-2 mb-3">
                          <Icon size={13} className={meta.color} />
                          <span className="text-xs font-bold text-foreground/60 uppercase tracking-wide">{groupName}</span>
                          <div className="flex-1 h-px bg-border mx-1" />
                          <span className="text-xs text-muted-foreground/40 font-mono">
                            {results.filter(r => r.status === "Pass").length}/{results.length}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {results
                            .map(r => (
                              <RuleCard
                                key={r.rule.id}
                                result={r}
                                agentId={id}
                                auditId={auditId}
                                auditTimestamp={auditData.timestamp}
                                agentUrl={agent?.url ?? ""}
                                agentAccessMode={agent?.access_mode}
                                token={token}
                                containers={containers}
                                focusedRuleId={focusedRuleId}
                                appliedFixEntry={appliedHistoryByRule.get(r.rule.id)}
                                onOpenWizard={openWizard}
                              />
                            ))
                          }
                        </div>
                      </div>
                    );
                  } else {
                    // Section view
                    const meta = sectionMeta(groupName);
                    return (
                      <div key={groupName}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-mono text-[11px] font-bold bg-muted/40 px-1.5 py-0.5 rounded border border-border text-muted-foreground shrink-0">{meta.num}</span>
                          <span className="text-xs font-bold text-foreground/60 uppercase tracking-wide truncate">{groupName}</span>
                          <div className="flex-1 h-px bg-border mx-1" />
                          <span className="text-xs text-muted-foreground/40 font-mono shrink-0">
                            {results.filter(r => r.status === "Pass").length}/{results.length}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {results
                            .map(r => (
                              <RuleCard
                                key={r.rule.id}
                                result={r}
                                agentId={id}
                                auditId={auditId}
                                auditTimestamp={auditData.timestamp}
                                agentUrl={agent?.url ?? ""}
                                agentAccessMode={agent?.access_mode}
                                token={token}
                                containers={containers}
                                focusedRuleId={focusedRuleId}
                                appliedFixEntry={appliedHistoryByRule.get(r.rule.id)}
                                onOpenWizard={openWizard}
                              />
                            ))
                          }
                        </div>
                      </div>
                    );
                  }
                })}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          Audit not found
        </div>
      )}

      <FixWizard
        open={wizardOpen}
        step={wizardStep}
        result={wizardResult}
        outcome={wizardOutcome}
        preview={wizardPreview}
        previewLoading={wizardPreviewLoading}
        targetConfig={wizardTargetConfig}
        progressEvents={wizardProgressEvents}
        stepIndex={wizardStepIndex}
        agentId={id}
        containers={containers}
        auditId={auditId}
        onConfirm={() => void applyFix()}
        onClose={closeWizard}
        onTargetChange={updateTargetConfig}
        onRerunAudit={() => {
          closeWizard();
          void navigate({ to: "/agents/$id/audit", params: { id } });
        }}
      />
      <FixAllWizard
        open={fixAllOpen}
        step={fixAllStep}
        currentIndex={fixAllIndex}
        ruleStatuses={ruleStatuses}
        selectedCount={fixAllSelectedCount}
        cgroupTargets={fixAllCgroupTargets}
        cgroupLoading={fixAllCgroupLoading}
        selectedCgroupRuleIds={fixAllSelectedCgroupRuleIds}
        onConfirm={() => void applyAll()}
        onClose={closeFixAll}
        onToggleRule={toggleFixAllRule}
        onSetAllSelected={setAllFixAllSelected}
        onUpdateCgroupTarget={updateFixAllCgroupTarget}
        onBackToConfirm={backFixAllToConfirm}
        onRerunAudit={() => {
          closeFixAll();
          void navigate({ to: "/agents/$id/audit", params: { id } });
        }}
      />
    </div>
  );
}
