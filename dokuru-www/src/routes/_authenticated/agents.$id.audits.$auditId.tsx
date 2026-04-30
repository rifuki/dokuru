import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditReportResponse, type AuditResponse, type AuditResult } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";
import { dockerApi, dockerCredential, type Container as DockerContainer } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import {
  Loader2, ShieldCheck, ShieldX, Shield, ChevronDown, ChevronUp,
  Terminal, Wrench, AlertTriangle, Server,
  ArrowLeft, Clock, Cpu, Container, Zap, BookOpen,
  Search, X, Layers, ArrowLeftRight, Link, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PILLAR_META, getRulePillar, type SecurityPillar } from "@/lib/audit-pillars";
import { userDocumentApi } from "@/lib/api/document";
import { getOrFetchPdfBlob } from "@/lib/pdf-cache";
import { useAuditStore } from "@/stores/use-audit-store";
import { FixWizard } from "@/features/audit/components/FixWizard";
import { FixAllWizard } from "@/features/audit/components/FixAllWizard";
import { FixHistoryPanel } from "@/features/audit/components/FixHistoryPanel";
import { AffectedItems } from "@/features/audit/components/AffectedItems";
import { useFix } from "@/features/audit/hooks/useFix";
import { useFixAll } from "@/features/audit/hooks/useFixAll";

type AuditDetailSearch = {
  ruleId?: string;
};

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

// ── Status indicator ─────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: "Pass" | "Fail" | "Error" }) {
  if (status === "Pass") return <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />;
  if (status === "Fail") return <ShieldX className="h-5 w-5 text-red-500 shrink-0" />;
  return <Shield className="h-5 w-5 text-orange-500 shrink-0" />;
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
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{label}</p>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => void copyText(command)}>
          Copy
        </Button>
      </div>
      <code className="block rounded border border-border/50 bg-zinc-950 p-3 font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre-wrap">
        $ {command}
      </code>
    </div>
  );
}

function CommandOutputBlock({ label, output }: { label: string; output?: string }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{label}</p>
      <pre className="rounded border border-border/50 bg-zinc-950 p-3 font-mono text-xs text-zinc-300 whitespace-pre-wrap overflow-x-auto">
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
    <div className="rounded-lg border border-[#2496ED]/20 bg-[#2496ED]/5 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[#2496ED]/10 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
            <Terminal className="h-3.5 w-3.5 text-[#2496ED] shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#2496ED]">Agent Verify</p>
              <p className="text-[11px] text-muted-foreground truncate">Run the registered audit command on the remote host now.</p>
            </div>
          </div>
        <Button size="sm" variant="outline" disabled={!canRun || loading} onClick={() => void runVerification()} className="h-8 shrink-0">
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Terminal className="mr-1.5 h-3.5 w-3.5" />}
          Run Verify
        </Button>
      </div>

      <div className="space-y-3 p-3">
        {!result && !error && (
          <p className="text-xs text-muted-foreground/70">
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

function RuleCard({ result, agentId, auditId, agentUrl, agentAccessMode, token, containers, focusedRuleId, onOpenWizard }: {
  result: AuditResult;
  agentId: string;
  auditId: string;
  agentUrl: string;
  agentAccessMode?: string;
  token?: string;
  containers?: DockerContainer[];
  focusedRuleId?: string;
  onOpenWizard: (result: AuditResult) => void;
}) {
  const { rule, status, message, affected, audit_command, raw_output, command_stderr, command_exit_code, references, rationale, impact, remediation_kind, remediation_guide } = result;
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

  const borderLeft = status === "Pass"
    ? "border-l-emerald-500/50"
    : status === "Fail"
      ? "border-l-red-400"
      : "border-l-amber-500/50";

  const cardTone = status === "Fail"
    ? "border-red-500/35 bg-red-500/[0.025] hover:bg-red-500/[0.04]"
    : "border-border bg-card";

  const pillar = getRulePillar(rule.id);
  const pillarMeta = PILLAR_META[pillar];
  const PillarIcon = pillarMeta.icon;

  const hasFix = status === "Fail" && !!(rule.remediation || remediation_guide || affected.length > 0);
  const hasDebug = !!(audit_command || raw_output !== undefined || command_stderr || typeof command_exit_code === "number" || (references && references.length > 0));
  const tabs = [
    { id: "overview" as const, label: "Overview", show: true },
    { id: "fix" as const, label: "Fix", show: hasFix },
    { id: "debug" as const, label: "Debug", show: hasDebug },
  ].filter(t => t.show);

  return (
    <div ref={cardRef} className={cn("rounded-lg border border-l-[3px] transition-colors", borderLeft, cardTone, isFocused && "ring-2 ring-primary/40")}>
      {/* Header row */}
      <div className="px-4 py-3 flex items-center gap-3">
        <button onClick={() => setOpen(v => !v)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <StatusIcon status={status} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="font-mono text-[11px] font-bold text-muted-foreground/70 bg-muted/40 px-1.5 py-0.5 rounded">
                {rule.id}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-muted/30 border-border text-muted-foreground">
                <PillarIcon size={10} className={pillarMeta.color} />
                {pillarMeta.name}
              </span>
              <SeverityBadge severity={rule.severity} status={status} />
              {affected.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
                  <AlertTriangle className="h-2.5 w-2.5" />
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
              onClick={(e) => { e.stopPropagation(); onOpenWizard(result); }}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md bg-[#2496ED] hover:bg-[#1d7ac7] text-white transition-all shadow-sm"
            >
              <Zap className="h-3 w-3" />
              Auto Fix
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
                    <pre className="text-xs bg-zinc-950 text-zinc-300 rounded-lg p-3 font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto border border-border/50">
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
                  <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
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

// ── Section group header ─────────────────────────────────────────────────────

function SectionHeader({ section, total, passed }: { section: string; total: number; passed: number }) {
  const meta = sectionMeta(section);
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] leading-none font-bold px-1.5 py-0.5 rounded border shrink-0 bg-muted/30 border-border text-muted-foreground">
          {meta.num}
        </span>
        <span className="text-sm font-semibold text-foreground/90">{meta.label}</span>
        <span className="text-xs text-muted-foreground/60 font-mono ml-auto">{passed}<span className="text-muted-foreground/40">/</span>{total}</span>
      </div>
      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700",
            pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Before/after comparison ──────────────────────────────────────────────────

function scoreTone(score: number) {
  return score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-rose-400";
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

  return (
    <div className="rounded-2xl border border-[#2496ED]/20 bg-card dark:bg-gradient-to-br dark:from-[#07111A] dark:via-[#0A0A0B] dark:to-[#111113] overflow-hidden shadow-xl">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight">Before / After Comparison</h3>
          <p className="text-sm text-muted-foreground">Compare the previous audit against the current one to track hardening progress.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#2496ED]/25 bg-[#2496ED]/10 px-3 py-1.5 text-xs font-bold text-[#2496ED]">
          <ArrowLeftRight className="h-3.5 w-3.5" />
          score delta {signed(scoreDelta)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Before</p>
            <span className="text-xs font-mono text-muted-foreground/60">{fmtDate(before.timestamp)}</span>
          </div>
          <div className="flex items-end gap-3">
            <span className={cn("text-5xl font-black tabular-nums leading-none", scoreTone(before.summary.score))}>
              {before.summary.score}
            </span>
            <span className="pb-1 text-sm font-mono text-muted-foreground">/ 100</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
              <p className="text-lg font-black text-emerald-400">{before.summary.passed}</p>
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Pass</p>
            </div>
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
              <p className="text-lg font-black text-rose-400">{before.summary.failed}</p>
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Fail</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
              <p className="text-lg font-black text-muted-foreground">{before.summary.total}</p>
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Total</p>
            </div>
          </div>
        </div>

        <div className="hidden w-px bg-border md:block" />

        <div className="border-t border-border p-5 space-y-4 md:border-t-0">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">After</p>
            <span className="text-xs font-mono text-muted-foreground/60">{fmtDate(after.timestamp)}</span>
          </div>
          <div className="flex items-end gap-3">
            <span className={cn("text-5xl font-black tabular-nums leading-none", scoreTone(after.summary.score))}>
              {after.summary.score}
            </span>
            <span className="pb-1 text-sm font-mono text-muted-foreground">/ 100</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
              <p className="text-lg font-black text-emerald-400">{after.summary.passed}</p>
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Pass {signed(passDelta)}</p>
            </div>
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
              <p className="text-lg font-black text-rose-400">{after.summary.failed}</p>
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Fail {signed(failDelta)}</p>
            </div>
            <div className="rounded-lg border border-[#2496ED]/20 bg-[#2496ED]/10 px-3 py-2">
              <p className="text-lg font-black text-[#2496ED]">{fixedRules.length}</p>
              <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Fixed</p>
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
                    <div key={result.rule.id} className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
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
                    <div key={result.rule.id} className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
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

// ── Main Page ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "Pass" | "Fail";
type ViewMode = "pillar" | "section";

function AuditDetailPage() {
  const { id, auditId } = Route.useParams();
  const { ruleId: focusedRuleId } = Route.useSearch();
  const navigate = useNavigate();
  const markAuditResultViewed = useAuditStore((state) => state.markAuditResultViewed);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [token, setToken] = useState<string | undefined>();
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [auditData, setAuditData] = useState<AuditResponse | null>(null);
  const [auditReport, setAuditReport] = useState<AuditReportResponse | null>(null);
  const [auditHistory, setAuditHistory] = useState<AuditResponse[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [pillarFilter, setPillarFilter] = useState<SecurityPillar | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("pillar");
  const [loading, setLoading] = useState(true);

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
    openFixAll,
    closeFixAll,
    applyAll,
    toggleRule: toggleFixAllRule,
    setAllSelected: setAllFixAllSelected,
  } = useFixAll({
    agentId: id,
    agentUrl: agent?.url ?? "",
    agentAccessMode: agent?.access_mode,
    token,
  });

  useEffect(() => {
    markAuditResultViewed(id, auditId);
  }, [auditId, id, markAuditResultViewed]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const a = await agentApi.getById(id);
        setAgent(a);
        setToken(dockerCredential(a) || undefined);
        const credential = dockerCredential(a);

        if (credential) {
          try {
            const response = await dockerApi.listContainers(a.url, credential, true);
            setContainers(response.data);
          } catch (containersError) {
            console.warn("Failed to load containers for affected links:", containersError);
            setContainers([]);
          }
        } else {
          setContainers([]);
        }

        const audit = await agentApi.getAuditById(id, auditId);
        console.log('Fetched audit:', audit);
        setAuditData(audit);

        try {
          const report = await agentApi.getAuditReport(id, auditId);
          setAuditReport(report);
        } catch (reportError) {
          console.warn("Failed to load Rust audit report, using client fallback:", reportError);
        }

        try {
          const history = await agentApi.listAudits(id);
          setAuditHistory(history);
        } catch (historyError) {
          console.warn("Failed to load audit history for comparison:", historyError);
          setAuditHistory([]);
        }
      } catch (error) {
        console.error('Failed to load audit:', error);
        toast.error("Failed to load audit");
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [id, auditId]);

  const previousAudit = auditData ? (() => {
    const sortedHistory = [...auditHistory].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    const currentIndex = sortedHistory.findIndex(audit => audit.id && audit.id === auditData.id);
    if (currentIndex >= 0) return sortedHistory[currentIndex + 1] ?? null;

    const currentTime = Date.parse(auditData.timestamp);
    return sortedHistory.find(audit => audit.id !== auditData.id && Date.parse(audit.timestamp) < currentTime) ?? null;
  })() : null;

  const report = auditReport?.report;
  const baseResults = report?.sorted_results ?? [...(auditData?.results ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === "Fail" ? -1 : 1;
    return a.rule.id.localeCompare(b.rule.id, undefined, { numeric: true });
  });

  // Group sections
  const sections: string[] = report
    ? report.sections.map(section => section.key)
    : auditData
      ? [...new Set(auditData.results.map(r => r.rule.section))]
      : [];

  const sectionStats: Record<string, { total: number; passed: number; percent: number }> = report
    ? Object.fromEntries(report.sections.map(section => [
      section.key,
      { total: section.total, passed: section.passed, percent: section.percent },
    ]))
    : auditData
      ? Object.fromEntries(sections.map(s => {
        const sectionRules = auditData.results.filter(r => r.rule.section === s);
        const passed = sectionRules.filter(r => r.status === "Pass").length;
        return [s, {
          total: sectionRules.length,
          passed,
          percent: sectionRules.length > 0 ? Math.round((passed / sectionRules.length) * 100) : 0,
        }];
      }))
      : {};

  // Sort sections: worst pass% first, so problem areas appear at top
  const sortedSections = report ? sections : [...sections].sort((a, b) => {
    const statA = sectionStats[a] ?? { total: 0, passed: 0 };
    const statB = sectionStats[b] ?? { total: 0, passed: 0 };
    const pctA = statA.total > 0 ? statA.passed / statA.total : 1;
    const pctB = statB.total > 0 ? statB.passed / statB.total : 1;
    return pctA - pctB;
  });

  const filteredResults = baseResults.filter(r => {
    const statusOk = statusFilter === "all" || r.status === statusFilter;
    const sectionOk = sectionFilter === "all" || r.rule.section === sectionFilter;
    const pillarOk = pillarFilter === "all" || getRulePillar(r.rule.id) === pillarFilter;
    const searchOk = !searchQuery ||
      r.rule.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.rule.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.message.toLowerCase().includes(searchQuery.toLowerCase());
    return statusOk && sectionOk && pillarOk && searchOk;
  }) ?? [];

  const pillarSummaries = report?.pillars ?? (Object.keys(PILLAR_META) as SecurityPillar[]).map(pillar => {
    const pillarRules = baseResults.filter(r => getRulePillar(r.rule.id) === pillar);
    const passed = pillarRules.filter(r => r.status === "Pass").length;
    const failed = pillarRules.filter(r => r.status === "Fail").length;
    const errors = pillarRules.filter(r => r.status === "Error").length;
    const total = passed + failed;

    return {
      key: pillar,
      label: PILLAR_META[pillar].name,
      number: null,
      total,
      passed,
      failed,
      errors,
      percent: total > 0 ? Math.round((passed / total) * 100) : 0,
    };
  });

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

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto w-full flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-10">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Security Audit</h2>
          <p className="text-muted-foreground text-sm mt-0.5">CIS Docker Benchmark v1.8.0</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
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
              <div className="p-6 flex flex-col">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">Audit Score</p>
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
                  <div className="mt-3 h-2 w-full rounded-full bg-muted/40 overflow-hidden shadow-inner">
                    <div
                      className={cn("h-full rounded-full transition-all duration-1000 ease-out",
                        auditData.summary.score >= 80 ? "bg-emerald-500"
                          : auditData.summary.score >= 60 ? "bg-amber-500"
                            : "bg-rose-500"
                      )}
                      style={{ width: `${auditData.summary.score}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">CIS Docker Benchmark v1.8.0 · {auditData.summary.total} rules</p>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setStatusFilter(f => f === "Pass" ? "all" : "Pass")}
                    aria-pressed={statusFilter === "Pass"}
                    className={cn(
                      "flex min-h-24 flex-col items-center justify-center rounded-[12px] border px-3 py-3 text-center transition-all duration-200",
                      statusFilter === "Pass"
                        ? "border-[#00d9a5]/50 bg-[#00d9a5]/10 ring-1 ring-[#00d9a5]/20"
                        : "border-[#00d9a5]/25 bg-[#00d9a5]/5 hover:bg-[#00d9a5]/10 hover:border-[#00d9a5]/35"
                    )}
                  >
                    <span className="block text-3xl font-black text-[#00d9a5]">{auditData.summary.passed}</span>
                    <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pass</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(f => f === "Fail" ? "all" : "Fail")}
                    aria-pressed={statusFilter === "Fail"}
                    className={cn(
                      "flex min-h-24 flex-col items-center justify-center rounded-[12px] border px-3 py-3 text-center transition-all duration-200",
                      statusFilter === "Fail"
                        ? "bg-rose-500/15 border-rose-500/45 ring-1 ring-rose-500/25"
                        : "bg-rose-500/5 border-rose-500/25 hover:bg-rose-500/10 hover:border-rose-500/35"
                    )}
                  >
                    <span className="block text-3xl font-black text-rose-400">{auditData.summary.failed}</span>
                    <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fail</span>
                  </button>
                  <div className="flex min-h-24 flex-col items-center justify-center rounded-[12px] border border-border bg-muted/20 px-3 py-3 text-center">
                    <span className="block text-3xl font-black text-foreground/80">{auditData.summary.total}</span>
                    <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-auto pt-6">
                  {[
                    { icon: Server, label: "Host", value: auditData.hostname },
                    { icon: Cpu, label: "Docker", value: auditData.docker_version },
                    { icon: Container, label: "Containers", value: String(auditData.total_containers) },
                    { icon: Clock, label: "Ran", value: fmtDate(auditData.timestamp).split(",")[1]?.trim() ?? fmtDate(auditData.timestamp) },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex min-w-0 items-center gap-2 rounded-[10px] border border-border/80 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/30">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">{label}</p>
                        <p className="truncate text-sm font-semibold text-foreground/90">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Pillar/Section breakdown with toggle */}
              <div className="p-6 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      {viewMode === "pillar" ? "Security Pillars" : "CIS Sections"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      View audit progress by {viewMode === "pillar" ? "security area" : "CIS benchmark section"}.
                    </p>
                  </div>
                  <div className="inline-flex w-fit items-center gap-1 rounded-[10px] border border-border bg-muted/25 p-1">
                    <button
                      type="button"
                      onClick={() => setViewMode("pillar")}
                      aria-pressed={viewMode === "pillar"}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-semibold transition-colors",
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
                        "inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-semibold transition-colors",
                        viewMode === "section" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      Sections
                    </button>
                  </div>
                </div>

                {viewMode === "pillar" ? (
                  pillarSummaries.map(pillarSummary => {
                    const pillar = pillarSummary.key as SecurityPillar;
                    const meta = PILLAR_META[pillar];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    const total = pillarSummary.total;
                    const passed = pillarSummary.passed;
                    const pct = pillarSummary.percent;

                    return (
                      <div key={pillar} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className={meta.color} />
                          <span className="text-sm font-semibold text-foreground/90">{meta.name}</span>
                          <span className="text-xs text-muted-foreground/60 font-mono ml-auto">{passed}<span className="text-muted-foreground/40">/</span>{total}</span>
                        </div>
                        <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-700", meta.barColor)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  sortedSections.map(s => (
                    <SectionHeader key={s} section={s}
                      total={sectionStats[s]?.total ?? 0}
                      passed={sectionStats[s]?.passed ?? 0}
                    />
                  ))
                )}

                {/* Quick Stats */}
                <div className="pt-4 mt-4 border-t border-border grid grid-cols-2 gap-2">
                  <div className="rounded-[10px] border border-border/80 bg-muted/20 px-3 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">Critical</p>
                    <p className="text-lg font-black text-rose-400">{report?.severity_failures.high ?? auditData.results.filter(r => r.rule.severity === "High" && r.status === "Fail").length}</p>
                  </div>
                  <div className="rounded-[10px] border border-border/80 bg-muted/20 px-3 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">Medium</p>
                    <p className="text-lg font-black text-amber-400">{report?.severity_failures.medium ?? auditData.results.filter(r => r.rule.severity === "Medium" && r.status === "Fail").length}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {previousAudit && (
            <BeforeAfterComparison
              before={previousAudit}
              after={auditData}
              fmtDate={fmtDate}
            />
          )}

          {/* ── Fix All banner ───────────────────────────────── */}
          {(() => {
            const autoFixable = baseResults.filter(r => r.status === "Fail" && r.remediation_kind === "auto");
            if (autoFixable.length === 0) return null;
            return (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#2496ED]/25 bg-[#2496ED]/5 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#2496ED]">
                    {autoFixable.length} rule{autoFixable.length > 1 ? "s" : ""} can be auto-fixed
                  </p>
                  <p className="text-xs text-[#2496ED]/60 mt-0.5">
                    Namespace isolation, cgroup limits, and privileged containers — one click.
                  </p>
                </div>
                <button
                  onClick={() => openFixAll(autoFixable)}
                  className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-[#2496ED] hover:bg-[#1e80cc] px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_-4px_rgba(36,150,237,0.5)] transition-all hover:shadow-[0_0_24px_-4px_rgba(36,150,237,0.7)] active:scale-[0.98]"
                >
                  <Zap className="h-4 w-4" />
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

          {report?.remediation.total_failed ? (
            <div className="rounded-2xl border border-border bg-card dark:bg-gradient-to-br dark:from-[#0A0A0B] dark:to-[#111113] overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-bold tracking-tight">Remediation Plan</h3>
                  <p className="text-sm text-muted-foreground">Highest-risk failed checks with suggested remediation order.</p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2">
                    <p className="text-lg font-black text-rose-400">{report.remediation.high_impact}</p>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">High</p>
                  </div>
                  <div className="rounded-lg border border-[#2496ED]/20 bg-[#2496ED]/10 px-3 py-2">
                    <p className="text-lg font-black text-[#2496ED]">{report.remediation.auto_fixable}</p>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Auto</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
                    <p className="text-lg font-black text-emerald-400">{report.remediation.quick_wins}</p>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Quick</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                    <p className="text-lg font-black text-amber-400">{report.remediation.manual + report.remediation.guided}</p>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Manual</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-border">
                {report.remediation.actions.slice(0, 5).map((action) => {
                  const pillar = action.pillar_key as SecurityPillar;
                  const meta = PILLAR_META[pillar];
                  const effortLabel = action.effort === "quick" ? "Quick" : action.effort === "moderate" ? "Moderate" : "Involved";
                  const kindLabel = action.remediation_kind === "auto" ? "Auto fix" : action.remediation_kind === "guided" ? "Guided" : "Manual";

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
                          <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/30 px-2 py-1 text-xs font-bold text-muted-foreground">
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
                      <div className="flex items-center gap-3 md:justify-end">
                        <div className="text-right">
                          <p className="text-lg font-black text-foreground">{action.risk_score}</p>
                          <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Risk</p>
                        </div>
                        {action.affected_count > 0 && (
                          <div className="text-right">
                            <p className="text-lg font-black text-amber-400">{action.affected_count}</p>
                            <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Affected</p>
                          </div>
                        )}
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
              <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-muted/20 shrink-0">
                <button
                  onClick={() => setViewMode("pillar")}
                  className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-bold transition-all",
                    viewMode === "pillar" ? "bg-[#2496ED] text-white" : "hover:bg-muted/40 text-muted-foreground")}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Pillars
                </button>
                <button
                  onClick={() => setViewMode("section")}
                  className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-bold transition-all",
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
                                agentUrl={agent?.url ?? ""}
                                agentAccessMode={agent?.access_mode}
                                token={token}
                                containers={containers}
                                focusedRuleId={focusedRuleId}
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
                                agentUrl={agent?.url ?? ""}
                                agentAccessMode={agent?.access_mode}
                                token={token}
                                containers={containers}
                                focusedRuleId={focusedRuleId}
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
        onConfirm={() => void applyAll()}
        onClose={closeFixAll}
        onToggleRule={toggleFixAllRule}
        onSetAllSelected={setAllFixAllSelected}
        onRerunAudit={() => {
          closeFixAll();
          void navigate({ to: "/agents/$id/audit", params: { id } });
        }}
      />
    </div>
  );
}
