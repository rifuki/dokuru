import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResponse, type AuditResult, type FixOutcome } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";
import { getAgentToken } from "@/stores/use-agent-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Play, Loader2, ShieldCheck, ShieldX, Shield, ChevronDown, ChevronUp,
    Terminal, Wrench, ExternalLink, AlertTriangle, Info, Server,
    Clock, Cpu, Container, RefreshCw, Zap, BookOpen, CheckCircle2,
    RotateCcw, ShieldAlert, XCircle, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agents/$id/audit")({
    component: AuditPage,
});

// ── Section metadata ────────────────────────────────────────────────────────

const SECTION_META: Record<string, { label: string; num: string; color: string; bg: string; border: string }> = {
    "Host Configuration":     { label: "Host",    num: "S1", color: "text-blue-500",   bg: "bg-blue-500/10",   border: "border-blue-500/30" },
    "Daemon Configuration":   { label: "Daemon",  num: "S2", color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/30" },
    "Config File Permissions":{ label: "Files",   num: "S3", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30" },
    "Container Images":       { label: "Images",  num: "S4", color: "text-teal-500",   bg: "bg-teal-500/10",   border: "border-teal-500/30" },
    "Container Runtime":      { label: "Runtime", num: "S5", color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/30" },
};

function sectionMeta(section: string) {
    return SECTION_META[section] ?? { label: section, color: "text-gray-500", bg: "bg-gray-500/10", border: "border-gray-500/30" };
}

// ── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
    const r = 52;
    const circ = 2 * Math.PI * r;
    const offset = circ - (score / 100) * circ;
    const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
    const label = score >= 80 ? "Secure" : score >= 60 ? "At Risk" : "Critical";

    return (
        <div className="relative flex items-center justify-center">
            <svg width="128" height="128" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10"
                    className="text-muted-foreground/10" />
                <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round" transform="rotate(-90 60 60)"
                    style={{ transition: "stroke-dashoffset 0.8s ease" }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold leading-none">{score}</span>
                <span className="text-xs text-muted-foreground mt-1">{label}</span>
            </div>
        </div>
    );
}

// ── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
    const map: Record<string, string> = {
        High: "bg-red-500/15 text-red-500 border-red-500/30",
        Medium: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
        Low: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    };
    return (
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border", map[severity] ?? "bg-muted text-muted-foreground")}>
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

// ── Fix Panel ────────────────────────────────────────────────────────────────

function FixPanel({ outcome, onDismiss }: { outcome: FixOutcome; onDismiss: () => void }) {
    const isApplied = outcome.status === "Applied";
    const isBlocked = outcome.status === "Blocked";

    return (
        <div className={cn(
            "rounded-lg border p-4 space-y-3 text-sm",
            isApplied ? "bg-green-500/10 border-green-500/30"
            : isBlocked ? "bg-red-500/10 border-red-500/30"
            : "bg-amber-500/10 border-amber-500/30"
        )}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    {isApplied
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        : isBlocked
                        ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        : <BookOpen className="h-4 w-4 text-amber-500 shrink-0" />
                    }
                    <span className="font-semibold text-sm">
                        {isApplied ? "Fix Applied" : isBlocked ? "Fix Blocked" : "Remediation Guide"}
                    </span>
                </div>
                <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
                    <XCircle className="h-4 w-4" />
                </button>
            </div>

            <p className="text-muted-foreground text-xs">{outcome.message}</p>

            {(outcome.requires_restart || outcome.requires_elevation) && (
                <div className="flex flex-wrap gap-2">
                    {outcome.requires_elevation && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded font-semibold">
                            <ShieldAlert className="h-2.5 w-2.5" /> Requires sudo/elevation
                        </span>
                    )}
                    {outcome.requires_restart && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 border border-blue-500/30 px-2 py-0.5 rounded font-semibold">
                            <RotateCcw className="h-2.5 w-2.5" /> Docker restart required
                        </span>
                    )}
                    {outcome.restart_command && (
                        <code className="block w-full text-xs bg-zinc-900 dark:bg-zinc-950 text-green-400 px-3 py-2 rounded-lg font-mono mt-1">
                            $ {outcome.restart_command}
                        </code>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Fix step definitions ──────────────────────────────────────────────────────

function getFixSteps(ruleId: string): string[] {
    if (ruleId === "2.10") return [
        "Creating dockremap system user…",
        "Creating /etc/subuid and /etc/subgid…",
        "Mapping subuid/subgid ranges for dockremap…",
        "Writing userns-remap to daemon.json…",
        "Restarting Docker daemon…",
    ];
    if (ruleId.startsWith("1.1")) return [
        "Writing audit rule to /etc/audit/rules.d/docker.rules…",
        "Reloading auditd service…",
    ];
    if (["3.1", "3.3", "3.5", "3.17"].includes(ruleId)) return [
        `Running chown root:root on target path…`,
    ];
    if (["3.2", "3.4", "3.6", "3.18"].includes(ruleId)) return [
        `Running chmod on target path…`,
    ];
    return ["Applying fix…"];
}

function requiresDockerRestart(ruleId: string) {
    return ruleId === "2.10";
}

// ── Live progress panel ───────────────────────────────────────────────────────

function FixProgress({ steps, currentStep }: { steps: string[]; currentStep: number }) {
    return (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                <span className="text-sm font-semibold text-blue-500">Executing fix…</span>
            </div>
            <div className="space-y-1.5">
                {steps.map((step, i) => (
                    <div key={i} className={cn(
                        "flex items-center gap-2 text-xs transition-all",
                        i < currentStep
                            ? "text-green-500"
                            : i === currentStep
                            ? "text-foreground font-medium"
                            : "text-muted-foreground/40"
                    )}>
                        {i < currentStep
                            ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                            : i === currentStep
                            ? <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                            : <div className="h-3 w-3 rounded-full border border-muted-foreground/20 shrink-0" />
                        }
                        {step}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Rule Card ────────────────────────────────────────────────────────────────

function RuleCard({ result, agentUrl, token }: {
    result: AuditResult;
    agentUrl: string;
    token?: string;
}) {
    const [open, setOpen] = useState(false);
    const [fixing, setFixing] = useState(false);
    const [fixOutcome, setFixOutcome] = useState<FixOutcome | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [fixStepIndex, setFixStepIndex] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { rule, status, message, affected, audit_command, raw_output, references, rationale, impact, remediation_kind } = result;
    const meta = sectionMeta(rule.section);
    const steps = getFixSteps(rule.id);
    const needsRestart = requiresDockerRestart(rule.id);

    const borderLeft = status === "Pass"
        ? "border-l-green-500/60"
        : status === "Fail"
        ? "border-l-red-500/60"
        : "border-l-orange-500/60";

    const openConfirm = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (remediation_kind === "auto") {
            setConfirmOpen(true);
        } else {
            void executeFix();
        }
    };

    const executeFix = async () => {
        setConfirmOpen(false);
        setFixing(true);
        setFixOutcome(null);
        setFixStepIndex(0);
        setOpen(true);

        // Animate steps at ~1.2s per step
        let idx = 0;
        intervalRef.current = setInterval(() => {
            idx++;
            if (idx < steps.length) setFixStepIndex(idx);
            else if (intervalRef.current) clearInterval(intervalRef.current);
        }, 1200);

        try {
            const outcome = await agentDirectApi.applyFix(agentUrl, rule.id, token);
            if (intervalRef.current) clearInterval(intervalRef.current);
            setFixOutcome(outcome);
            if (outcome.status === "Applied") {
                toast.success(`Fix applied for rule ${rule.id}`);
            } else if (outcome.status === "Blocked") {
                toast.error(`Rule ${rule.id}: ${outcome.message.slice(0, 80)}`);
            }
        } catch {
            if (intervalRef.current) clearInterval(intervalRef.current);
            toast.error("Failed to connect to agent");
        } finally {
            setFixing(false);
        }
    };

    const fixButtonStyle = remediation_kind === "auto"
        ? "bg-blue-500 hover:bg-blue-600 text-white border-blue-500"
        : "bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border-amber-500/40";

    return (
        <>
        {/* Confirmation dialog */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-blue-500" />
                        Apply Auto Fix — Rule {rule.id}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        The following system-level changes will be applied automatically:
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {/* Steps list — outside <p> to avoid nesting error */}
                <ul className="space-y-1.5">
                    {steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                            <ListChecks className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
                            {s.replace("…", "")}
                        </li>
                    ))}
                </ul>
                {needsRestart && (
                    <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                            <strong>Docker daemon will be restarted.</strong> Running containers
                            may be briefly interrupted.
                        </span>
                    </div>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => void executeFix()}
                        className="bg-blue-500 hover:bg-blue-600 text-white"
                    >
                        <Zap className="h-3.5 w-3.5 mr-1.5" /> Apply Fix
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className={cn("rounded-xl border border-border bg-card border-l-4 transition-shadow hover:shadow-sm", borderLeft)}>
            {/* Header row */}
            <div
                className={cn(
                    "px-4 py-3.5 flex items-start gap-3",
                    status === "Pass" ? "hover:bg-green-500/5" : status === "Fail" ? "hover:bg-red-500/5" : "hover:bg-orange-500/5",
                    "rounded-xl transition-colors"
                )}
            >
                {/* Clickable area */}
                <button onClick={() => setOpen(v => !v)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                    <StatusIcon status={status} />
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="font-mono text-[11px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {rule.id}
                            </span>
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", meta.bg, meta.color, meta.border)}>
                                {meta.num} {meta.label}
                            </span>
                            <SeverityBadge severity={rule.severity} />
                            {affected.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-orange-500/10 text-orange-500 border border-orange-500/30 px-1.5 py-0.5 rounded font-semibold">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    {affected.length} affected
                                </span>
                            )}
                        </div>
                        <p className="font-medium text-sm leading-snug">{rule.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{message}</p>
                    </div>
                </button>

                {/* Right controls */}
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {/* Fix button — only for failed rules */}
                    {status === "Fail" && (
                        <button
                            onClick={openConfirm}
                            disabled={fixing}
                            className={cn(
                                "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all",
                                fixButtonStyle,
                                fixing && "opacity-60 cursor-not-allowed"
                            )}
                        >
                            {fixing ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : remediation_kind === "auto" ? (
                                <Zap className="h-3 w-3" />
                            ) : (
                                <Wrench className="h-3 w-3" />
                            )}
                            {fixing ? "Fixing…" : remediation_kind === "auto" ? "Auto Fix" : "Fix Guide"}
                        </button>
                    )}

                    <button onClick={() => setOpen(v => !v)}>
                        {open
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        }
                    </button>
                </div>
            </div>

            {/* Expanded detail */}
            {open && (
                <div className="px-4 pb-4 pt-0 border-t border-border/50 space-y-4 text-sm">
                    {/* Live progress */}
                    {fixing && (
                        <div className="pt-3">
                            <FixProgress steps={steps} currentStep={fixStepIndex} />
                        </div>
                    )}

                    {/* Fix outcome panel */}
                    {!fixing && fixOutcome && (
                        <div className="pt-3">
                            <FixPanel outcome={fixOutcome} onDismiss={() => setFixOutcome(null)} />
                        </div>
                    )}

                    {/* Message full */}
                    <div className={fixing || fixOutcome ? "" : "pt-3"}>
                        <p className="text-muted-foreground">{message}</p>
                    </div>

                    {/* Description */}
                    {rule.description && (
                        <div>
                            <h5 className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                                <Info className="h-3.5 w-3.5" /> About
                            </h5>
                            <p className="text-sm text-muted-foreground">{rule.description}</p>
                        </div>
                    )}

                    {/* Affected */}
                    {affected.length > 0 && (
                        <div>
                            <h5 className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-orange-500 mb-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" /> Affected ({affected.length})
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                                {affected.map((item, i) => (
                                    <code key={i} className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded">
                                        {item}
                                    </code>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Remediation */}
                    {rule.remediation && (
                        <div>
                            <h5 className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                                <Wrench className="h-3.5 w-3.5" /> Remediation
                            </h5>
                            <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3 font-mono whitespace-pre-wrap">{rule.remediation}</p>
                        </div>
                    )}

                    {/* Audit Command */}
                    {audit_command && (
                        <div>
                            <h5 className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                                <Terminal className="h-3.5 w-3.5" /> Audit Command
                            </h5>
                            <code className="block text-xs bg-zinc-900 dark:bg-zinc-950 text-green-400 p-3 rounded-lg overflow-x-auto font-mono">
                                $ {audit_command}
                            </code>
                        </div>
                    )}

                    {/* Raw Output */}
                    {raw_output && (
                        <div>
                            <h5 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Raw Output</h5>
                            <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono text-muted-foreground">
                                {raw_output}
                            </pre>
                        </div>
                    )}

                    {/* Rationale + Impact */}
                    {(rationale || impact) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {rationale && (
                                <div className="bg-muted/30 rounded-lg p-3">
                                    <h5 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Rationale</h5>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{rationale}</p>
                                </div>
                            )}
                            {impact && (
                                <div className="bg-muted/30 rounded-lg p-3">
                                    <h5 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Impact</h5>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{impact}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* References */}
                    {references && references.length > 0 && (
                        <div>
                            <h5 className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                                <ExternalLink className="h-3.5 w-3.5" /> References
                            </h5>
                            <div className="space-y-1">
                                {references.map((ref, i) => (
                                    <a key={i} href={ref.startsWith("http") ? ref : undefined}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                        {ref}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
        </>
    );
}

// ── Section group header ─────────────────────────────────────────────────────

function SectionHeader({ section, total, passed }: { section: string; total: number; passed: number }) {
    const meta = sectionMeta(section);
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    return (
        <div className="flex items-center gap-3 py-1">
            <span className={cn("text-xs font-bold px-2 py-1 rounded-md border", meta.bg, meta.color, meta.border)}>
                {meta.num} {meta.label}
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500")}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-xs text-muted-foreground font-mono">{passed}/{total}</span>
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "Pass" | "Fail";

function AuditPage() {
    const { id } = Route.useParams();
    const [agent, setAgent] = useState<Agent | null>(null);
    const [token, setToken] = useState<string | undefined>();
    const [auditData, setAuditData] = useState<AuditResponse | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sectionFilter, setSectionFilter] = useState<string>("all");

    useEffect(() => {
        agentApi.getById(id).then(a => {
            setAgent(a);
            setToken(getAgentToken(a.id) ?? undefined);
        }).catch(() => toast.error("Failed to load agent"));
    }, [id]);

    const handleRunAudit = async () => {
        if (!agent) return;
        if (!token) return toast.error("Agent token not found");
        setIsRunning(true);
        try {
            const data = await agentDirectApi.runAudit(agent.url, token);
            setAuditData(data);
            toast.success(`Audit complete — ${data.summary.score}/100`);
        } catch {
            toast.error("Audit failed");
        } finally {
            setIsRunning(false);
        }
    };

    // Group sections
    const sections = auditData
        ? [...new Set(auditData.results.map(r => r.rule.section))]
        : [];

    const sectionStats = auditData
        ? Object.fromEntries(sections.map(s => {
            const sectionRules = auditData.results.filter(r => r.rule.section === s);
            return [s, { total: sectionRules.length, passed: sectionRules.filter(r => r.status === "Pass").length }];
        }))
        : {};

    const filteredResults = auditData?.results.filter(r => {
        const statusOk = statusFilter === "all" || r.status === statusFilter;
        const sectionOk = sectionFilter === "all" || r.rule.section === sectionFilter;
        return statusOk && sectionOk;
    }) ?? [];

    // Group filtered results by section
    const groupedResults = filteredResults.reduce<Record<string, AuditResult[]>>((acc, r) => {
        (acc[r.rule.section] ??= []).push(r);
        return acc;
    }, {});

    const fmtDate = (ts: string) => {
        try { return new Date(ts).toLocaleString(); } catch { return ts; }
    };

    return (
        <div className="max-w-5xl mx-auto w-full space-y-6 pb-10">
            {/* ── Top bar ─────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Security Audit</h2>
                    <p className="text-muted-foreground text-sm mt-0.5">CIS Docker Benchmark v1.8.0</p>
                </div>
                <Button onClick={handleRunAudit} disabled={isRunning || !agent} size="sm" className="shrink-0">
                    {isRunning
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…</>
                        : auditData
                        ? <><RefreshCw className="h-4 w-4 mr-2" /> Re-run Audit</>
                        : <><Play className="h-4 w-4 mr-2" /> Run Audit</>
                    }
                </Button>
            </div>

            {auditData ? (
                <>
                    {/* ── Summary ────────────────────────────────────── */}
                    <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
                        {/* Score ring + meta */}
                        <div className="flex flex-col items-center justify-center bg-card border rounded-2xl px-8 py-5 gap-2">
                            <ScoreRing score={auditData.summary.score} />
                            <span className="text-xs text-muted-foreground font-medium">CIS Score</span>
                        </div>

                        {/* Stats grid + metadata */}
                        <div className="flex flex-col gap-3">
                            {/* Pass / Fail / Total */}
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    onClick={() => setStatusFilter(f => f === "Pass" ? "all" : "Pass")}
                                    className={cn(
                                        "flex flex-col items-center justify-center rounded-xl border p-4 transition-all",
                                        statusFilter === "Pass"
                                            ? "bg-green-500/20 border-green-500/50 ring-2 ring-green-500/30"
                                            : "bg-green-500/5 border-green-500/20 hover:bg-green-500/10"
                                    )}
                                >
                                    <span className="text-3xl font-bold text-green-500">{auditData.summary.passed}</span>
                                    <span className="text-xs text-muted-foreground mt-1">Passed</span>
                                </button>
                                <button
                                    onClick={() => setStatusFilter(f => f === "Fail" ? "all" : "Fail")}
                                    className={cn(
                                        "flex flex-col items-center justify-center rounded-xl border p-4 transition-all",
                                        statusFilter === "Fail"
                                            ? "bg-red-500/20 border-red-500/50 ring-2 ring-red-500/30"
                                            : "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                                    )}
                                >
                                    <span className="text-3xl font-bold text-red-500">{auditData.summary.failed}</span>
                                    <span className="text-xs text-muted-foreground mt-1">Failed</span>
                                </button>
                                <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-4">
                                    <span className="text-3xl font-bold">{auditData.summary.total}</span>
                                    <span className="text-xs text-muted-foreground mt-1">Total Rules</span>
                                </div>
                            </div>

                            {/* Meta info */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {[
                                    { icon: Server, label: "Host", value: auditData.hostname },
                                    { icon: Cpu, label: "Docker", value: auditData.docker_version },
                                    { icon: Container, label: "Containers", value: String(auditData.total_containers) },
                                    { icon: Clock, label: "Ran at", value: fmtDate(auditData.timestamp).split(",")[1]?.trim() ?? fmtDate(auditData.timestamp) },
                                ].map(({ icon: Icon, label, value }) => (
                                    <div key={label} className="bg-muted/30 rounded-lg px-3 py-2 flex items-center gap-2 min-w-0">
                                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                                            <p className="text-xs font-medium truncate">{value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Section breakdown ───────────────────────────── */}
                    <div className="bg-card border rounded-2xl p-4 space-y-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Section Breakdown</h3>
                        {sections.map(s => (
                            <SectionHeader key={s} section={s}
                                total={sectionStats[s]?.total ?? 0}
                                passed={sectionStats[s]?.passed ?? 0}
                            />
                        ))}
                    </div>

                    {/* ── Filters ─────────────────────────────────────── */}
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs text-muted-foreground mr-1">Section:</span>
                        <button
                            onClick={() => setSectionFilter("all")}
                            className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all",
                                sectionFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted")}
                        >
                            All
                        </button>
                        {sections.map(s => {
                            const meta = sectionMeta(s);
                            return (
                                <button key={s}
                                    onClick={() => setSectionFilter(f => f === s ? "all" : s)}
                                    className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all",
                                        sectionFilter === s
                                            ? cn(meta.bg, meta.color, meta.border)
                                            : "bg-card border-border hover:bg-muted")}
                                >
                                    {meta.num} {meta.label}
                                </button>
                            );
                        })}
                        {(statusFilter !== "all" || sectionFilter !== "all") && (
                            <button
                                onClick={() => { setStatusFilter("all"); setSectionFilter("all"); }}
                                className="text-xs px-2.5 py-1 text-muted-foreground hover:text-foreground ml-auto"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>

                    {/* ── Results grouped by section ──────────────────── */}
                    {Object.keys(groupedResults).length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground text-sm">
                            No results match the current filters.
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {Object.entries(groupedResults).map(([section, results]) => {
                                const meta = sectionMeta(section);
                                return (
                                    <div key={section}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className={cn("text-xs font-bold px-2 py-1 rounded-md border", meta.bg, meta.color, meta.border)}>
                                                {meta.num} {meta.label}
                                            </span>
                                            <span className="text-xs text-muted-foreground">{section}</span>
                                            <Badge variant="outline" className="text-[10px] ml-auto font-mono">
                                                {results.filter(r => r.status === "Pass").length}/{results.length}
                                            </Badge>
                                        </div>
                                        <div className="space-y-2">
                                            {results
                                                .sort((a, b) => {
                                                    if (a.status !== b.status) return a.status === "Fail" ? -1 : 1;
                                                    return a.rule.id.localeCompare(b.rule.id, undefined, { numeric: true });
                                                })
                                                .map(r => (
                                                    <RuleCard
                                                        key={r.rule.id}
                                                        result={r}
                                                        agentUrl={agent?.url ?? ""}
                                                        token={token}
                                                    />
                                                ))
                                            }
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                /* ── Empty state ──────────────────────────────────── */
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 py-20 px-8 text-center gap-4">
                    <div className="rounded-full bg-primary/10 p-5">
                        <Shield className="h-10 w-10 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold">No Audit Results Yet</h3>
                        <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                            Run the CIS Docker Benchmark v1.8.0 audit to check namespace isolation,
                            cgroup configuration, file permissions, and more.
                        </p>
                    </div>
                    <Button onClick={handleRunAudit} disabled={isRunning || !agent}>
                        {isRunning
                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running Audit…</>
                            : <><Play className="h-4 w-4 mr-2" /> Run Security Audit</>
                        }
                    </Button>
                    <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {["Host Config", "Daemon", "File Perms", "Images", "Namespaces", "Cgroups"].map(t => (
                            <span key={t} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
