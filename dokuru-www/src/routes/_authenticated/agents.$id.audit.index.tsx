import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentStore } from "@/stores/use-agent-store";
import { AUDIT_CANCELLED_MESSAGE, useAuditStore, type AuditProgressLine, type AuditStreamStatus } from "@/stores/use-audit-store";
import { useEffect, useRef, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResponse, type AuditResult, type FixOutcome } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";
import { dockerApi, dockerCredential, type Container as DockerContainer } from "@/services/docker-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Play, Loader2, ShieldCheck, ShieldX, Shield, ChevronDown, ChevronUp,
    Terminal, Wrench, ExternalLink, AlertTriangle, Info, Server,
    Clock, Cpu, Container, RefreshCw, BookOpen, CheckCircle2,
    RotateCcw, ShieldAlert, XCircle, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AffectedItems } from "@/features/audit/components/AffectedItems";
import { LOCAL_AGENT_ID } from "@/lib/local-agent";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";

export const Route = createFileRoute("/_authenticated/agents/$id/audit/")({
    component: AuditPage,
});

// ── Section metadata ────────────────────────────────────────────────────────

const SECTION_META: Record<string, { label: string; num: string; color: string; bg: string; border: string }> = {
    "Host Configuration":     { label: "Host",    num: "S1", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
    "Daemon Configuration":   { label: "Daemon",  num: "S2", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
    "Config File Permissions":{ label: "Files",   num: "S3", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
    "Container Images":       { label: "Images",  num: "S4", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
    "Container Runtime":      { label: "Runtime", num: "S5", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" },
};

function sectionMeta(section: string) {
    return SECTION_META[section] ?? { label: section, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border" };
}


// ── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity, status }: { severity: string; status?: "Pass" | "Fail" | "Error" }) {
    if (status === "Pass") {
        return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border border-border bg-muted/30 text-muted-foreground">
                {severity} if failed
            </span>
        );
    }

    const map: Record<string, string> = {
        High: "bg-red-500/15 text-red-500 border-red-500/30",
        Medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        Low: "bg-muted/40 text-muted-foreground border-border",
    };
    return (
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border", map[severity] ?? "bg-muted text-muted-foreground")}>
            {severity}
        </span>
    );
}

function failedSeverityTone(severity: string) {
    if (severity === "High") {
        return {
            borderLeft: "border-l-red-500/60",
            hover: "hover:bg-red-500/5",
            icon: "text-red-500",
        };
    }

    if (severity === "Medium") {
        return {
            borderLeft: "border-l-amber-500/70",
            hover: "hover:bg-amber-500/5",
            icon: "text-amber-400",
        };
    }

    return {
        borderLeft: "border-l-muted-foreground/40",
        hover: "hover:bg-muted/30",
        icon: "text-muted-foreground",
    };
}

// ── Status indicator ─────────────────────────────────────────────────────────

function StatusIcon({ status, severity }: { status: "Pass" | "Fail" | "Error"; severity?: string }) {
    if (status === "Pass") return <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />;
    if (status === "Fail") return <ShieldX className={cn("h-5 w-5 shrink-0", failedSeverityTone(severity ?? "Low").icon)} />;
    return <Shield className="h-5 w-5 text-orange-500 shrink-0" />;
}

const KNOWN_AUTO_FIX_RULE_IDS = new Set([
    "1.1.3", "1.1.4", "1.1.5", "1.1.6", "1.1.7", "1.1.8", "1.1.9", "1.1.10", "1.1.11", "1.1.12", "1.1.14", "1.1.18",
    "2.10", "2.15",
    "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.17", "3.18",
    "4.1", "4.6",
    "5.4", "5.5", "5.10", "5.11", "5.12", "5.16", "5.17", "5.18", "5.21", "5.22", "5.25", "5.29", "5.31",
]);

function remediationKindForResult(result: AuditResult) {
    return result.remediation_kind ?? (KNOWN_AUTO_FIX_RULE_IDS.has(result.rule.id) ? "auto" : "manual");
}

async function copyCommand(command: string) {
    try {
        await navigator.clipboard.writeText(command);
        toast.success("Command copied");
    } catch {
        toast.error("Failed to copy command");
    }
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
                        <code className="block w-full text-xs bg-muted/50 dark:bg-zinc-950 text-primary dark:text-green-400 px-3 py-2 rounded-lg font-mono mt-1">
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
    if (ruleId === "2.15") return [
        "Writing no-new-privileges to daemon.json…",
        "Restarting Docker daemon…",
        "Verifying daemon security options…",
    ];
    if (ruleId === "2.10") return [
        "Creating dockremap system user…",
        "Creating /etc/subuid and /etc/subgid…",
        "Mapping subuid/subgid ranges for dockremap…",
        "Writing userns-remap to daemon.json…",
        "Restarting Docker daemon…",
    ];
    if (ruleId === "5.11") return [
        "Finding containers without memory limits…",
        "Applying docker update --memory=256m…",
        "Verifying memory cgroup limits…",
    ];
    if (ruleId === "5.12") return [
        "Finding containers without CPU shares…",
        "Applying docker update --cpu-shares=512…",
        "Verifying CPU cgroup shares…",
    ];
    if (ruleId === "5.29") return [
        "Finding containers without PIDs limits…",
        "Applying docker update --pids-limit=100…",
        "Verifying PIDs cgroup limits…",
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
    return ruleId === "2.10" || ruleId === "2.15";
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

function RuleCard({ result, agentId, agentUrl, agentAccessMode, token, containers }: {
    result: AuditResult;
    agentId: string;
    agentUrl: string;
    agentAccessMode?: string;
    token?: string;
    containers?: DockerContainer[];
}) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { fixingRules, fixOutcomes, setFixing, setFixOutcome } = useAuditStore();
    const fixing = fixingRules[agentId]?.[result.rule.id] ?? false;
    const fixOutcome = fixOutcomes[agentId]?.[result.rule.id] ?? null;
    const [open, setOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);
    const [fixStepIndex, setFixStepIndex] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { rule, status, message, affected, audit_command, raw_output, command_stderr, command_exit_code, references, rationale, impact } = result;
    const remediation_kind = remediationKindForResult(result);
    const manualRemediation = result.remediation_guide ?? rule.remediation;
    const meta = sectionMeta(rule.section);
    const steps = getFixSteps(rule.id);
    const needsRestart = requiresDockerRestart(rule.id);

    const failTone = failedSeverityTone(rule.severity);

    const borderLeft = status === "Pass"
        ? "border-l-green-500/60"
        : status === "Fail"
        ? failTone.borderLeft
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
        setFixing(agentId, rule.id, true);
        setFixOutcome(agentId, rule.id, null);
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
            let refreshedAudit: AuditResponse | null = null;
            let outcome: FixOutcome;
            if (agentAccessMode === "relay") {
                const relayFix = await agentApi.applyFix(agentId, rule.id);
                outcome = relayFix.outcome;
                refreshedAudit = relayFix.audit;
            } else {
                outcome = await agentDirectApi.applyFix(agentUrl, rule.id, token);
            }
            if (intervalRef.current) clearInterval(intervalRef.current);
            setFixOutcome(agentId, rule.id, outcome);
            if (outcome.status === "Applied") {
                toast.success(`Fix applied for rule ${rule.id}`);
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["agent-audit"] }),
                    queryClient.invalidateQueries({ queryKey: ["agent-containers", agentId] }),
                ]);
                if (refreshedAudit?.id) {
                    navigate({
                        to: "/agents/$id/audits/$auditId",
                        params: { id: agentId, auditId: refreshedAudit.id },
                        search: { from: "latest" },
                    });
                    return;
                }
                setTimeout(() => setFixOutcome(agentId, rule.id, null), 3000);
            } else if (outcome.status === "Blocked") {
                toast.error(`Rule ${rule.id}: ${outcome.message.slice(0, 80)}`);
            }
        } catch {
            if (intervalRef.current) clearInterval(intervalRef.current);
            toast.error(agentAccessMode === "relay" ? "Failed to apply relay fix" : "Failed to connect to agent");
        } finally {
            setFixing(agentId, rule.id, false);
        }
    };

    return (
        <>
        {/* Confirmation dialog */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-blue-500" />
                        Apply Fix — Rule {rule.id}
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
                        <Wrench className="h-3.5 w-3.5 mr-1.5" /> Apply Fix
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Manual Guide dialog */}
        <AlertDialog open={guideOpen} onOpenChange={setGuideOpen}>
            <AlertDialogContent className="max-h-[80vh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-amber-500" />
                        Manual Remediation Guide — Rule {rule.id}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {rule.title}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="space-y-4 text-sm">
                    {manualRemediation && (
                        <div>
                            <h5 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Steps</h5>
                            <p className="overflow-x-auto rounded-lg bg-muted/40 p-3 font-mono text-sm whitespace-pre-wrap text-muted-foreground">{manualRemediation}</p>
                        </div>
                    )}
                    
                    {audit_command && (
                        <div>
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h5 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Verify with</h5>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => void copyCommand(audit_command)}>
                                    Copy
                                </Button>
                            </div>
                            <code className="block text-xs bg-muted/50 dark:bg-zinc-950 text-primary dark:text-green-400 p-3 rounded-lg overflow-x-auto font-mono">
                                $ {audit_command}
                            </code>
                        </div>
                    )}

                    {(rationale || impact) && (
                        <div className="grid grid-cols-1 gap-3">
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

                    {references && references.length > 0 && (
                        <div>
                            <h5 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">References</h5>
                            <div className="space-y-1">
                                {references.map((ref, i) => (
                                    <a key={i} href={ref.startsWith("http") ? ref : undefined}
                                        target="_blank" rel="noopener noreferrer"
                                        className="flex min-w-0 items-center gap-1.5 text-xs text-primary hover:underline">
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                        <span className="min-w-0 truncate">{ref}</span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <AlertDialogFooter>
                    <AlertDialogAction onClick={() => setGuideOpen(false)}>Close</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <div className={cn("rounded-xl border border-border bg-card border-l-4 transition-shadow hover:shadow-sm", borderLeft)}>
            {/* Header row */}
            <div
                className={cn(
                    "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start",
                    status === "Pass" ? "hover:bg-green-500/5" : status === "Fail" ? failTone.hover : "hover:bg-orange-500/5",
                    "rounded-xl transition-colors"
                )}
            >
                {/* Clickable area */}
                <button onClick={() => setOpen(v => !v)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                    <StatusIcon status={status} severity={rule.severity} />
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="font-mono text-[11px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {rule.id}
                            </span>
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", meta.bg, meta.color, meta.border)}>
                                {meta.num} {meta.label}
                            </span>
                            <SeverityBadge severity={rule.severity} status={status} />
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
                <div className="ml-8 flex shrink-0 flex-wrap items-center justify-end gap-2 sm:ml-0 sm:mt-0.5">
                    {/* Fix button — only for failed rules */}
                    {status === "Fail" && (
                        <>
                            {remediation_kind === "auto" && (
                                <button
                                    onClick={openConfirm}
                                    disabled={fixing}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all",
                                        "bg-blue-500 hover:bg-blue-600 text-white border-blue-500",
                                        fixing && "opacity-60 cursor-not-allowed"
                                    )}
                                >
                                    {fixing ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Wrench className="h-3 w-3" />
                                    )}
                                    {fixing ? "Fixing…" : "Apply Fix"}
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); setGuideOpen(true); }}
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border-amber-500/40"
                            >
                                <BookOpen className="h-3 w-3" />
                                Manual Guide
                            </button>
                        </>
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
                            <FixPanel outcome={fixOutcome} onDismiss={() => setFixOutcome(agentId, rule.id, null)} />
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
                                <AffectedItems
                                    items={affected}
                                    containers={containers}
                                    agentId={agentId}
                                    chipClassName="py-0.5"
                                />
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
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                                <h5 className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                                    <Terminal className="h-3.5 w-3.5" /> Registered Audit Command
                                </h5>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => void copyCommand(audit_command)}>
                                    Copy
                                </Button>
                            </div>
                            <code className="block text-xs bg-muted/50 dark:bg-zinc-950 text-primary dark:text-green-400 p-3 rounded-lg overflow-x-auto font-mono">
                                $ {audit_command}
                            </code>
                        </div>
                    )}

                    {(raw_output !== undefined || command_stderr || typeof command_exit_code === "number") && (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <h5 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Real Shell Output</h5>
                                {typeof command_exit_code === "number" && (
                                    <span className="rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                                        exit {command_exit_code}
                                    </span>
                                )}
                            </div>
                            <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono text-muted-foreground">
                                {raw_output || "(no stdout)"}
                            </pre>
                            {command_stderr && (
                                <pre className="text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono text-red-300">
                                    {command_stderr}
                                </pre>
                            )}
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

const AUDIT_HISTORY_CACHE_PREFIX = "agent_audit_history_";

function auditHistoryCacheKey(agentId: string) {
    return `${AUDIT_HISTORY_CACHE_PREFIX}${agentId}`;
}

function sortAuditHistory(history: AuditResponse[]) {
    return [...history].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function readCachedAuditHistory(agentId: string): AuditResponse[] {
    try {
        const raw = localStorage.getItem(auditHistoryCacheKey(agentId));
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? sortAuditHistory(parsed as AuditResponse[]) : [];
    } catch {
        return [];
    }
}

function writeCachedAuditHistory(agentId: string, history: AuditResponse[]) {
    try {
        localStorage.setItem(auditHistoryCacheKey(agentId), JSON.stringify(sortAuditHistory(history).slice(0, 20)));
    } catch {
        // Audit history cache is best-effort; the agent remains the source of truth.
    }
}

function LatestAuditSkeleton() {
    return (
        <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-3 w-80 max-w-full" />
                <div className="flex gap-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                </div>
            </div>
        </div>
    );
}

function AuditRunTerminal({
    total,
    current,
    lines,
    error,
    status,
    savedAuditId,
    canCancel,
    onOpenResult,
    onCancel,
}: {
    total: number;
    current: number;
    lines: AuditProgressLine[];
    error: string | null;
    status: AuditStreamStatus;
    savedAuditId?: string;
    canCancel: boolean;
    onOpenResult: () => void;
    onCancel: () => void;
}) {
    const isComplete = status === "complete";
    const isSaving = status === "saving";
    const isCancelled = status === "cancelled";
    const pct = total > 0 ? Math.round(((isComplete ? total : current) / total) * 100) : 0;
    const latest = lines.at(-1);
    const [autoScroll, setAutoScroll] = useState(true);
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!autoScroll) return;
        const log = logRef.current;
        if (!log) return;
        log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
    }, [autoScroll, current, error, lines.length]);

    return (
        <div className="flex h-full w-full animate-in flex-col overflow-hidden bg-card text-left fade-in zoom-in-95 duration-500">
            <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                    </div>
                    <Terminal className="h-4 w-4 shrink-0 text-primary" />
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <h3 className="shrink-0 text-sm font-semibold text-foreground">Live security audit</h3>
                        <span className="text-muted-foreground/50">/</span>
                        <p className="truncate font-mono text-xs font-semibold text-primary">
                            CIS Docker Benchmark v1.8.0
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                    {isComplete && savedAuditId && (
                        <Button size="sm" variant="outline" className="audit-result-cta h-8 px-3" onClick={onOpenResult}>
                            <span className="relative z-10">Open Result</span>
                        </Button>
                    )}
                    {canCancel && (
                        <Button size="sm" variant="outline" className="h-8 px-3 text-muted-foreground hover:text-rose-400" onClick={onCancel}>
                            <XCircle className="h-4 w-4" />
                            Cancel Audit
                        </Button>
                    )}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Auto Scroll</span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={autoScroll}
                            aria-label="Toggle audit terminal auto scroll"
                            onClick={() => setAutoScroll((value) => !value)}
                            className={cn(
                                "relative h-5 w-9 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                autoScroll
                                    ? "border-emerald-400/30 bg-emerald-500"
                                    : "border-border bg-muted",
                            )}
                        >
                            <span
                                className={cn(
                                    "absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform",
                                    autoScroll ? "translate-x-4" : "translate-x-0",
                                )}
                            />
                        </button>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                        {isComplete ? total : current}/{total || "?"} · {pct}%
                    </span>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-xs text-muted-foreground truncate">
                            {error
                                ? "audit stream failed"
                                : isCancelled
                                ? "audit cancelled"
                                : isSaving
                                ? "saving audit result..."
                                : isComplete
                                ? "audit complete"
                                : latest
                                ? `checking ${latest.ruleId} · ${latest.title}`
                                : "opening audit stream..."}
                        </p>
                        {error ? (
                            <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                        ) : isCancelled ? (
                            <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : isComplete ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                        )}
                    </div>
                    <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                        <div
                            className={cn("h-full rounded-full transition-all duration-500", error ? "bg-rose-500" : isCancelled ? "bg-muted-foreground" : "bg-[#2496ED]")}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>

                <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-zinc-50 p-4 font-mono text-[11px] leading-relaxed text-zinc-800 shadow-inner dark:bg-zinc-950 dark:text-zinc-200">
                    {lines.length === 0 && !error && !isCancelled && (
                        <p className="text-muted-foreground/50">$ connecting to dokuru-agent audit websocket...</p>
                    )}
                    {lines.length === 0 && isCancelled && (
                        <p className="text-muted-foreground/50">$ audit cancelled by user.</p>
                    )}
                    {lines.map(line => (
                        <div key={`${line.ruleId}-${line.index}`} className="space-y-0.5 border-b border-border/50 py-1.5 last:border-b-0">
                            <div className="flex items-center gap-2">
                                <span className="shrink-0 text-muted-foreground/40">[{line.index.toString().padStart(2, "0")}/{line.total}]</span>
                                <span className={cn(
                                    "font-bold",
                                    line.status === "Pass" ? "text-emerald-600 dark:text-emerald-400" : line.status === "Fail" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400",
                                )}>{line.status.toUpperCase()}</span>
                                <span className="shrink-0 text-[#2496ED]">{line.ruleId}</span>
                                <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">{line.title}</span>
                            </div>
                            {line.command && <p className="truncate text-zinc-500 dark:text-zinc-500 sm:pl-16">$ {line.command}</p>}
                            <p className="truncate text-zinc-600 dark:text-zinc-400 sm:pl-16">{line.message}</p>
                        </div>
                    ))}
                    {error && <p className="text-rose-400">! {error}</p>}
                </div>

            </div>
        </div>
    );
}

function AuditPage() {
    const { id } = Route.useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { agentOnlineStatus } = useAgentStore();
    const { auditHistories, setAuditHistory, startAudit, cancelAudit } = useAuditStore();
    const auditStream = useAuditStore((state) => state.auditStreams[id]);
    const isOnline = !!agentOnlineStatus[id];
    const [agent, setAgent] = useState<Agent | null>(null);
    const [token, setToken] = useState<string | undefined>();
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [auditData] = useState<AuditResponse | null>(null);
    const auditStreamStatus = auditStream?.status ?? "idle";
    const isRunning = auditStreamStatus === "running" || auditStreamStatus === "saving";
    const canCancelAudit = auditStreamStatus === "running";
    const auditHistory = auditHistories[id] ?? [];
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sectionFilter, setSectionFilter] = useState<string>("all");
    const auditTotal = auditStream?.total ?? 0;
    const auditCurrent = auditStream?.current ?? 0;
    const auditProgressLines = auditStream?.lines ?? [];
    const auditStreamError = auditStream?.error ?? null;
    const savedAuditId = auditStream?.savedAudit?.id;
    const latestAudit = auditHistory[0] ?? auditStream?.savedAudit ?? null;
    const hasAnyAudit = !!latestAudit || !!savedAuditId;
    const showAuditTerminal = auditStreamStatus !== "idle" && (
        isRunning || auditStreamStatus === "complete" || auditStreamStatus === "error" || auditStreamStatus === "cancelled" || auditProgressLines.length > 0
    );
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const mountedRef = useRef(false);
    const scrollMemory = useWindowScrollMemory(`agent:${id}:audit`, !historyLoading || hasAnyAudit || showAuditTerminal);

    useEffect(() => {
        let cancelled = false;
        const cachedHistory = readCachedAuditHistory(id);
        if (cachedHistory.length > 0) {
            setAuditHistory(id, cachedHistory);
            queryClient.setQueryData(["audits", id], cachedHistory);
            for (const audit of cachedHistory) {
                if (audit.id) queryClient.setQueryData(["audit", id, audit.id], audit);
            }
        }

        queueMicrotask(() => {
            if (cancelled) return;
            setHistoryLoading(true);
            setHistoryError(null);
        });

        agentApi.getById(id).then(a => {
            if (cancelled) return;
            setAgent(a);
            setToken(dockerCredential(a) || undefined);
            agentApi.listAudits(a.id)
                .then(h => {
                    if (cancelled) return;
                    const sorted = sortAuditHistory(h);
                    setAuditHistory(id, sorted);
                    writeCachedAuditHistory(id, sorted);
                    queryClient.setQueryData(["audits", id], sorted);
                    for (const audit of sorted) {
                        if (audit.id) queryClient.setQueryData(["audit", id, audit.id], audit);
                    }
                })
                .catch((error) => {
                    if (cancelled) return;
                    const message = error instanceof Error ? error.message : "Failed to load audit history";
                    setHistoryError(message);
                })
                .finally(() => {
                    if (!cancelled) setHistoryLoading(false);
                });
            const credential = dockerCredential(a);
            if (!credential && a.id !== LOCAL_AGENT_ID) {
                setContainers([]);
                return;
            }
            dockerApi.listContainers(a.url, credential, true)
                .then(response => setContainers(response.data))
                .catch(() => setContainers([]));
        }).catch(() => {
            if (cancelled) return;
            setHistoryLoading(false);
            toast.error("Failed to load agent");
        });
        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const handleRunAudit = async () => {
        if (!agent) return;
        if (agent.access_mode !== "relay" && !token && agent.id !== LOCAL_AGENT_ID) {
            return toast.error("Agent token not found. Edit this agent and paste the token once to sync it across devices.");
        }
        try {
            const savedAudit = await startAudit(agent, token);
            if (!mountedRef.current) return;
            const nextHistory = sortAuditHistory([
                savedAudit,
                ...auditHistory.filter((item) => item.id !== savedAudit.id),
            ]);
            setAuditHistory(id, nextHistory);
            writeCachedAuditHistory(id, nextHistory);
            queryClient.setQueryData(["audits", id], nextHistory);
            if (savedAudit.id) queryClient.setQueryData(["audit", id, savedAudit.id], savedAudit);
            try {
                const savedAuditId = savedAudit.id;
                const toastId = savedAuditId ? `audit-complete-${id}-${savedAuditId}` : `audit-complete-${id}-${Date.now()}`;
                const toastOptions: NonNullable<Parameters<typeof toast.success>[1]> = {
                    id: toastId,
                    description: "Open the saved audit result.",
                    duration: 12_000,
                };
                if (savedAuditId) {
                    toastOptions.action = {
                        label: "Open result",
                        onClick: () => {
                            toast.dismiss(toastId);
                            void navigate({
                                to: "/agents/$id/audits/$auditId",
                                params: { id, auditId: savedAuditId },
                                search: { from: "latest" },
                            });
                        },
                    };
                }
                toast.success(`Audit complete - ${savedAudit.summary.score}/100`, toastOptions);
                await queryClient.invalidateQueries({ queryKey: ["audits", id] });
            } catch {
                toast.error("Failed to refresh audit history");
            }
        } catch (error) {
            if (!mountedRef.current) return;
            const message = error instanceof Error ? error.message : "Audit failed";
            if (message === AUDIT_CANCELLED_MESSAGE) return;
            toast.error(message);
        }
    };

    const handleCancelAudit = () => {
        cancelAudit(id);
        toast(AUDIT_CANCELLED_MESSAGE, { description: "The running audit stream was stopped." });
    };

    const openSavedAudit = () => {
        if (!savedAuditId) return;
        void navigate({
            to: "/agents/$id/audits/$auditId",
            params: { id, auditId: savedAuditId },
            search: { from: "latest" },
        });
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

    // Sort sections: worst pass% first, so problem areas appear at top
    const sortedSections = [...sections].sort((a, b) => {
        const statA = sectionStats[a] ?? { total: 0, passed: 0 };
        const statB = sectionStats[b] ?? { total: 0, passed: 0 };
        const pctA = statA.total > 0 ? statA.passed / statA.total : 1;
        const pctB = statB.total > 0 ? statB.passed / statB.total : 1;
        return pctA - pctB;
    });

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
        <div className={cn("mx-auto w-full max-w-5xl space-y-6 pb-10", scrollMemory.isRestoring && "invisible")}>
            {/* ── Top bar ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Security Audit</h2>
                    <p className="text-muted-foreground text-sm mt-0.5">CIS Docker Benchmark v1.8.0</p>
                </div>
                {!isRunning && (
                    <Button onClick={handleRunAudit} disabled={!agent || !isOnline} className="w-full shrink-0 sm:w-auto" title={!isOnline ? "Agent offline" : undefined}>
                        {hasAnyAudit
                            ? <><RefreshCw className="h-4 w-4 mr-2" /> Re-run Audit</>
                            : <><Play className="h-4 w-4 mr-2" /> Run Audit</>
                        }
                    </Button>
                )}
            </div>

            {auditData ? (
                <>
                    {/* ── Summary Card ────────────────────────────────── */}
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                        {/* Terminal-style header */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500/70" />
                                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-500/70" />
                                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500/70" />
                                <span className="ml-3 text-xs font-mono text-muted-foreground truncate">
                                    {agent?.name ?? id} / {auditData.hostname}
                                </span>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground shrink-0 ml-4">
                                audit · {fmtDate(auditData.timestamp).split(",")[1]?.trim() ?? fmtDate(auditData.timestamp)}
                            </span>
                        </div>

                        {/* Body: score left + breakdown right */}
                        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                            {/* Left: Score + stats + meta */}
                            <div className="p-5 space-y-4">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Audit Score</p>
                                <div className="flex items-baseline gap-2">
                                    <span className={cn("text-5xl font-bold tabular-nums",
                                        auditData.summary.score >= 80 ? "text-green-500"
                                        : auditData.summary.score >= 60 ? "text-yellow-500"
                                        : "text-red-500"
                                    )}>
                                        {auditData.summary.score}
                                    </span>
                                    <span className="text-sm text-muted-foreground font-mono">/ 100</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full transition-all duration-700",
                                            auditData.summary.score >= 80 ? "bg-green-500"
                                            : auditData.summary.score >= 60 ? "bg-yellow-500"
                                            : "bg-red-500"
                                        )}
                                        style={{ width: `${auditData.summary.score}%` }}
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => setStatusFilter(f => f === "Pass" ? "all" : "Pass")}
                                        className={cn(
                                            "flex flex-col items-center py-2.5 rounded-xl border transition-all",
                                            statusFilter === "Pass"
                                                ? "bg-green-500/20 border-green-500/50 ring-2 ring-green-500/30"
                                                : "bg-green-500/5 border-green-500/20 hover:bg-green-500/10"
                                        )}
                                    >
                                        <span className="text-xl font-bold text-green-500">{auditData.summary.passed}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Pass</span>
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter(f => f === "Fail" ? "all" : "Fail")}
                                        className={cn(
                                            "flex flex-col items-center py-2.5 rounded-xl border transition-all",
                                            statusFilter === "Fail"
                                                ? "bg-red-500/20 border-red-500/50 ring-2 ring-red-500/30"
                                                : "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
                                        )}
                                    >
                                        <span className="text-xl font-bold text-red-500">{auditData.summary.failed}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Fail</span>
                                    </button>
                                    <div className="flex flex-col items-center py-2.5 rounded-xl border border-border/50 bg-muted/20 cursor-default select-none">
                                        <span className="text-xl font-bold text-muted-foreground">{auditData.summary.total}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Total</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 pt-1">
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

                            {/* Right: Section breakdown */}
                            <div className="p-5 space-y-3">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Section Breakdown</p>
                                {sortedSections.map(s => (
                                    <SectionHeader key={s} section={s}
                                        total={sectionStats[s]?.total ?? 0}
                                        passed={sectionStats[s]?.passed ?? 0}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Filters ─────────────────────────────────────── */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                        <span className="text-xs text-muted-foreground mr-1">Section:</span>
                        <button
                            onClick={() => setSectionFilter("all")}
                            className={cn("shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium transition-all",
                                sectionFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted")}
                        >
                            All
                        </button>
                        {sortedSections.map(s => {
                            const meta = sectionMeta(s);
                            return (
                                <button key={s}
                                    onClick={() => setSectionFilter(f => f === s ? "all" : s)}
                                    className={cn("shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium transition-all",
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
                                className="ml-auto shrink-0 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
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
                                                        agentId={id}
                                                        agentUrl={agent?.url ?? ""}
                                                        agentAccessMode={agent?.access_mode}
                                                        token={token}
                                                        containers={containers}
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
                <>
                    {/* ── Run New Audit Card ────────────────────────────── */}
                    <div className={cn(
                        "relative overflow-hidden rounded-3xl border transition-all duration-500 ease-out",
                        showAuditTerminal
                            ? "h-[500px] border-border bg-card sm:h-[520px] md:h-[540px]"
                            : "h-[340px] border-border/70 bg-card/90 px-4 py-4 sm:h-[350px] md:h-[360px]",
                    )}>
                        <div className={cn("pointer-events-none absolute inset-0 transition-opacity duration-500", showAuditTerminal ? "opacity-0" : "bg-white/[0.018] opacity-100")} />
                        {showAuditTerminal ? (
                            <AuditRunTerminal
                                total={auditTotal}
                                current={auditCurrent}
                                lines={auditProgressLines}
                                error={auditStreamError}
                                status={auditStreamStatus}
                                savedAuditId={savedAuditId}
                                canCancel={canCancelAudit}
                                onOpenResult={openSavedAudit}
                                onCancel={handleCancelAudit}
                            />
                        ) : (
                            <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 text-center">
                                <div className="rounded-full border border-white/10 bg-white/[0.035] p-5 shadow-sm">
                                    <Shield className="h-10 w-10 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold">{hasAnyAudit ? "Re-run Security Audit" : "Run New Security Audit"}</h3>
                                    <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                                        Run the CIS Docker Benchmark v1.8.0 audit to check namespace isolation,
                                        cgroup configuration, file permissions, and more.
                                    </p>
                                </div>
                                <Button onClick={handleRunAudit} disabled={!agent || !isOnline}>
                                    {hasAnyAudit
                                        ? <><RefreshCw className="h-4 w-4 mr-2" /> Re-run Security Audit</>
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

                    {/* ── Latest audit status ───────────────────────────── */}
                    <>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-semibold">Latest Audit</h3>
                                    {latestAudit && historyLoading && (
                                        <Badge variant="outline" className="border-primary/25 bg-primary/10 text-[10px] text-primary">Refreshing</Badge>
                                    )}
                                    {latestAudit && historyError && !historyLoading && (
                                        <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-[10px] text-amber-300">Cached</Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {latestAudit && historyError && !historyLoading
                                        ? "Showing last saved audit while history refresh is unavailable"
                                        : "Most recent security audit result"}
                                </p>
                            </div>
                            <Link to="/agents/$id/audits" params={{ id: agent?.id ?? id }} className="w-full sm:w-auto">
                                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                                    <Clock className="h-4 w-4" /> History
                                </Button>
                            </Link>
                        </div>

                        {latestAudit?.id ? (
                            <Link
                                to="/agents/$id/audits/$auditId"
                                params={{ id, auditId: latestAudit.id }}
                                search={{ from: "latest" }}
                                className="group flex w-full flex-col gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center"
                            >
                                <div className="flex-shrink-0">
                                    <div className="relative w-16 h-16">
                                        <svg width="64" height="64" viewBox="0 0 64 64">
                                            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4"
                                                className="text-muted-foreground/10" />
                                            <circle cx="32" cy="32" r="28" fill="none" 
                                                stroke={latestAudit.summary.score >= 80 ? "#22c55e" : latestAudit.summary.score >= 60 ? "#f59e0b" : "#ef4444"}
                                                strokeWidth="4"
                                                strokeDasharray={`${2 * Math.PI * 28}`}
                                                strokeDashoffset={`${2 * Math.PI * 28 - (latestAudit.summary.score / 100) * 2 * Math.PI * 28}`}
                                                strokeLinecap="round" transform="rotate(-90 32 32)"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className={`text-xl font-bold ${
                                                latestAudit.summary.score >= 80 ? "text-green-500" :
                                                latestAudit.summary.score >= 60 ? "text-yellow-500" : "text-red-500"
                                            }`}>{latestAudit.summary.score}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="mb-1 flex flex-wrap items-center gap-2">
                                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-sm font-medium">{fmtDate(latestAudit.timestamp)}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mb-2">
                                        {latestAudit.hostname} • Docker {latestAudit.docker_version} • {latestAudit.total_containers} containers
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className="text-[10px]">
                                            {latestAudit.summary.passed} passed
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px]">
                                            {latestAudit.summary.failed} failed
                                        </Badge>
                                        <Badge variant="outline" className="text-[10px]">
                                            {latestAudit.summary.total} total
                                        </Badge>
                                    </div>
                                </div>
                                <ChevronDown className="hidden h-5 w-5 -rotate-90 text-muted-foreground transition-colors group-hover:text-foreground sm:block" />
                            </Link>
                        ) : historyLoading ? (
                            <LatestAuditSkeleton />
                        ) : historyError ? (
                            <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-200">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <div>
                                    <p className="font-semibold">Audit history could not be refreshed</p>
                                    <p className="mt-1 text-xs text-muted-foreground">Existing audits may still be on the agent. Open History or retry when the connection is stable.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed bg-card/50 p-6 text-sm text-muted-foreground">
                                No saved audits yet. Run an audit once and Dokuru will keep the latest result here.
                            </div>
                        )}
                    </>
                </>
            )}
        </div>
    );
}
