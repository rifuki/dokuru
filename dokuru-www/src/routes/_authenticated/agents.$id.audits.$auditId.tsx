import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditReportResponse, type AuditResponse, type AuditResult, type FixOutcome } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";
import { getAgentToken } from "@/stores/use-agent-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Loader2, ShieldCheck, ShieldX, Shield, ChevronDown, ChevronUp,
    Terminal, Wrench, AlertTriangle, Info, Server,
    ArrowLeft, Clock, Cpu, Container, Zap, BookOpen, CheckCircle2,
    RotateCcw, ShieldAlert, XCircle, ListChecks, Search, X, Layers, ArrowLeftRight, Link, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PILLAR_META, getRulePillar, type SecurityPillar } from "@/lib/audit-pillars";

export const Route = createFileRoute("/_authenticated/agents/$id/audits/$auditId")({
    component: AuditDetailPage,
});

// ── Section metadata (CIS sections) ─────────────────────────────────────────

const SECTION_META: Record<string, { label: string; num: string; color: string; bg: string; border: string }> = {
    "Host Configuration":     { label: "Host",    num: "S1", color: "text-blue-500",   bg: "bg-blue-500/10",   border: "border-blue-500/30" },
    "Docker Daemon Configuration": { label: "Daemon", num: "S2", color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/30" },
    "Daemon Configuration":   { label: "Daemon",  num: "S2", color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/30" },
    "Docker Daemon Configuration Files": { label: "Files", num: "S3", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30" },
    "Config File Permissions":{ label: "Files",   num: "S3", color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30" },
    "Container Images and Build Files": { label: "Images", num: "S4", color: "text-teal-500", bg: "bg-teal-500/10", border: "border-teal-500/30" },
    "Container Images":       { label: "Images",  num: "S4", color: "text-teal-500",   bg: "bg-teal-500/10",   border: "border-teal-500/30" },
    "Container Runtime":      { label: "Runtime", num: "S5", color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/30" },
};

function sectionMeta(section: string) {
    return SECTION_META[section] ?? { label: section, num: "", color: "text-gray-500", bg: "bg-gray-500/10", border: "border-gray-500/30" };
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

function RuleCard({ result, agentId, agentUrl, agentAccessMode, token }: {
    result: AuditResult;
    agentId: string;
    agentUrl: string;
    agentAccessMode?: string;
    token?: string;
}) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [fixing, setFixing] = useState(false);
    const [fixOutcome, setFixOutcome] = useState<FixOutcome | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);
    const [fixStepIndex, setFixStepIndex] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { rule, status, message, affected, audit_command, raw_output, references, rationale, impact, remediation_kind, remediation_guide } = result;
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
            setFixOutcome(outcome);
            
            if (outcome.status === "Applied") {
                if (refreshedAudit?.id) {
                    toast.success(`Fix applied for rule ${rule.id}. Audit refreshed.`);
                    await queryClient.invalidateQueries({ queryKey: ["agent-audit"] });
                    navigate({
                        to: "/agents/$id/audits/$auditId",
                        params: { id: agentId, auditId: refreshedAudit.id },
                    });
                    return;
                }

                if (agentAccessMode === "relay") {
                    toast.success(`Fix applied for rule ${rule.id}`);
                    toast.info("Audit refresh did not return a new result");
                    return;
                }

                toast.success(`✅ Fix applied for rule ${rule.id}! Refreshing audit...`, {
                    duration: 4000,
                });
                
                // Force immediate refetch of audit data
                await queryClient.invalidateQueries({ queryKey: ["agent-audit"] });
                await queryClient.refetchQueries({ queryKey: ["agent-audit"] });
                
                // Show success message after refresh
                setTimeout(() => {
                    toast.info("Audit data refreshed with latest status", {
                        duration: 3000,
                    });
                    setFixOutcome(null);
                }, 2000);
                
            } else if (outcome.status === "Blocked") {
                const needsSudo = outcome.message.toLowerCase().includes("permission") || 
                                 outcome.message.toLowerCase().includes("sudo") ||
                                 outcome.message.toLowerCase().includes("elevated");
                
                if (needsSudo) {
                    toast.error(`⚠️ Rule ${rule.id}: Requires sudo/root access`, {
                        description: "Please run the agent with elevated privileges",
                        duration: 5000,
                    });
                } else {
                    toast.error(`❌ Rule ${rule.id}: ${outcome.message.slice(0, 80)}`, {
                        duration: 5000,
                    });
                }
            }
        } catch {
            if (intervalRef.current) clearInterval(intervalRef.current);
            toast.error(agentAccessMode === "relay" ? "Failed to apply relay fix" : "Failed to connect to agent", {
                description: agentAccessMode === "relay"
                    ? "Check if the relay agent is connected"
                    : "Check if the agent is running and accessible",
                duration: 4000,
            });
        } finally {
            setFixing(false);
        }
    };

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

        {/* Manual Guide dialog */}
        <AlertDialog open={guideOpen} onOpenChange={setGuideOpen}>
            <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
                    {rule.remediation && (
                        <div>
                            <h5 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Steps</h5>
                            <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3 font-mono whitespace-pre-wrap">{rule.remediation}</p>
                        </div>
                    )}
                    
                    {audit_command && (
                        <div>
                            <h5 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">Verify with</h5>
                            <code className="block text-xs bg-zinc-900 dark:bg-zinc-950 text-green-400 p-3 rounded-lg overflow-x-auto font-mono">
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
                                        className="flex items-center gap-1.5 text-xs text-primary hover:underline break-all">
                                        <Link className="h-3 w-3 shrink-0" />
                                        {ref}
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

        <div className={cn("rounded-xl border bg-card dark:bg-gradient-to-br dark:from-[#0A0A0B] dark:to-[#111113] border-l-4 transition-all hover:shadow-lg hover:scale-[1.01]", borderLeft)}>
            {/* Header row */}
            <div
                className={cn(
                    "px-5 py-4 flex items-start gap-4",
                    status === "Pass" ? "hover:bg-emerald-500/5" : status === "Fail" ? "hover:bg-rose-500/5" : "hover:bg-amber-500/5",
                    "rounded-xl transition-all duration-200"
                )}
            >
                {/* Clickable area */}
                <button onClick={() => setOpen(v => !v)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                    <StatusIcon status={status} />
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="font-mono text-xs font-black text-muted-foreground bg-muted/40 px-2 py-1 rounded border border-border">
                                {rule.id}
                            </span>
                            {/* Pillar badge */}
                            {(() => {
                                const pillar = getRulePillar(rule.id);
                                const pillarMeta = PILLAR_META[pillar];
                                const PillarIcon = pillarMeta.icon;
                                return (
                                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded border", pillarMeta.bg, pillarMeta.color, pillarMeta.border)}>
                                        <PillarIcon size={12} />
                                        {pillarMeta.name}
                                    </span>
                                );
                            })()}
                            <SeverityBadge severity={rule.severity} />
                            {affected.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/40 px-2 py-1 rounded font-bold">
                                    <AlertTriangle className="h-3 w-3" />
                                    {affected.length} affected
                                </span>
                            )}
                        </div>
                        <p className="font-semibold text-base leading-snug text-foreground">{rule.title}</p>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{message}</p>
                    </div>
                </button>

                {/* Right controls */}
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {/* Fix button — only for failed rules */}
                    {status === "Fail" && (
                        <>
                            {remediation_kind === "auto" && (
                                <button
                                    onClick={openConfirm}
                                    disabled={fixing}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-all shadow-sm",
                                        "bg-[#2496ED] hover:bg-[#1d7ac7] text-white border-[#2496ED]/50 hover:shadow-[0_0_12px_rgba(36,150,237,0.4)]",
                                        fixing && "opacity-60 cursor-not-allowed"
                                    )}
                                >
                                    {fixing ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Zap className="h-3.5 w-3.5" />
                                    )}
                                    {fixing ? "Fixing…" : "Auto Fix"}
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); setGuideOpen(true); }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-all bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/40 hover:shadow-sm"
                            >
                                <BookOpen className="h-3.5 w-3.5" />
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
                            <FixPanel outcome={fixOutcome} onDismiss={() => setFixOutcome(null)} />
                        </div>
                    )}

                    {/* Description */}
                    {rule.description && (
                        <div className={cn("bg-blue-500/5 border border-blue-500/20 rounded-lg p-4", fixing || fixOutcome ? "" : "mt-3")}>
                            <h5 className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide text-blue-400 mb-2">
                                <Info className="h-4 w-4" /> About
                            </h5>
                            <p className="text-sm text-foreground/80 leading-relaxed">{rule.description}</p>
                        </div>
                    )}

                    {/* Affected */}
                    {affected.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                            <h5 className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide text-amber-400 mb-3">
                                <AlertTriangle className="h-4 w-4" /> Affected ({affected.length})
                            </h5>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {affected.map((item, i) => {
                                    // Smart icon detection
                                    let IconComponent = Container;
                                    if (item.includes('dockerd') || item.includes('/usr/bin/') || item.includes('daemon')) {
                                        IconComponent = Server;
                                    } else if (item.includes('.sock') || item.includes('.socket')) {
                                        IconComponent = Link;
                                    } else if (item.includes('/etc/') || item.includes('.conf') || item.includes('.json') || item.includes('.service')) {
                                        IconComponent = FileText;
                                    }
                                    
                                    return (
                                        <div key={i} className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 group hover:bg-amber-500/15 transition-colors">
                                            <IconComponent className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                            <code className="text-xs text-amber-300 font-mono truncate">{item}</code>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Remediation */}
                    {rule.remediation && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
                            <h5 className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide text-emerald-400 mb-2">
                                <Wrench className="h-4 w-4" /> Remediation
                            </h5>
                            <p className="text-sm text-foreground/80 bg-muted/60 dark:bg-black/30 rounded-lg p-3 font-mono leading-relaxed">{rule.remediation}</p>
                        </div>
                    )}

                    {/* Fix Guide */}
                    {remediation_guide && (
                        <div className="bg-[#2496ED]/5 border border-[#2496ED]/20 rounded-lg p-4">
                            <h5 className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide text-[#2496ED] mb-2">
                                <BookOpen className="h-4 w-4" /> Fix Guide
                            </h5>
                            <pre className="text-sm bg-muted/60 dark:bg-black/30 rounded-lg p-3 font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap">{remediation_guide}</pre>
                        </div>
                    )}

                    {/* Audit Command */}
                    {audit_command && (
                        <div className="bg-muted/20 border border-border rounded-lg p-4">
                            <h5 className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide text-foreground/80 mb-2">
                                <Terminal className="h-4 w-4" /> Audit Command
                            </h5>
                            <code className="block text-sm bg-muted dark:bg-black/50 text-emerald-400 p-3 rounded-lg overflow-x-auto font-mono border border-emerald-500/20">
                                $ {audit_command}
                            </code>
                        </div>
                    )}

                    {/* Raw Output */}
                    {raw_output && (
                        <div className="bg-muted/20 border border-border rounded-lg p-4">
                            <h5 className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide text-foreground/80 mb-2">
                                <FileText className="h-4 w-4" /> Raw Output
                            </h5>
                            <pre className="text-xs bg-muted dark:bg-black/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono text-muted-foreground border border-border">
                                {raw_output}
                            </pre>
                        </div>
                    )}

                    {/* Rationale + Impact */}
                    {(rationale || impact) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {rationale && (
                                <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-4">
                                    <h5 className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide text-violet-400 mb-2">
                                        <Info className="h-4 w-4" /> Rationale
                                    </h5>
                                    <p className="text-sm text-foreground/80 leading-relaxed">{rationale}</p>
                                </div>
                            )}
                            {impact && (
                                <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-4">
                                    <h5 className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide text-rose-400 mb-2">
                                        <AlertTriangle className="h-4 w-4" /> Impact
                                    </h5>
                                    <p className="text-sm text-foreground/80 leading-relaxed">{impact}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* References */}
                    {references && references.length > 0 && (
                        <div className="bg-muted/20 border border-border rounded-lg p-4">
                            <h5 className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide text-foreground/80 mb-3">
                                <BookOpen className="h-4 w-4" /> References
                            </h5>
                            <div className="space-y-2">
                                {references.map((ref, i) => {
                                    // Check if it's a CIS reference
                                    const isCIS = ref.includes("CIS Docker Benchmark");
                                    
                                    if (isCIS) {
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => toast.info("📄 CIS PDF viewer coming soon!", { description: "Upload PDF to backend and view inline" })}
                                                className="flex items-center gap-2 text-sm text-[#2496ED] hover:text-[#1d7ac7] transition-colors group w-full text-left"
                                            >
                                                <BookOpen className="h-3.5 w-3.5 shrink-0 group-hover:scale-110 transition-transform" />
                                                <span className="group-hover:underline">{ref}</span>
                                            </button>
                                        );
                                    }
                                    
                                    return (
                                        <a key={i} href={ref.startsWith("http") ? ref : undefined}
                                            target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-sm text-[#2496ED] hover:text-[#1d7ac7] transition-colors group">
                                            <Link className="h-3.5 w-3.5 shrink-0 group-hover:scale-110 transition-transform" />
                                            <span className="group-hover:underline break-all">{ref}</span>
                                        </a>
                                    );
                                })}
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
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <span className={cn("text-sm font-bold px-3 py-1.5 rounded-lg border shrink-0", meta.bg, meta.color, meta.border)}>
                    {meta.num}
                </span>
                <span className="text-sm font-semibold text-foreground/90 min-w-[120px]">{meta.label}</span>
                <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden shadow-inner">
                    <div
                        className={cn("h-full rounded-full transition-all duration-700", 
                            pct === 100 ? "bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]" 
                            : pct >= 50 ? "bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.6)]" 
                            : "bg-rose-500 shadow-[0_0_8px_rgba(251,113,133,0.6)]"
                        )}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <span className="text-xs text-muted-foreground/60 font-mono shrink-0 min-w-[50px] text-right">{passed}<span className="text-muted-foreground/40">/</span>{total}</span>
            </div>
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "Pass" | "Fail";
type ViewMode = "pillar" | "section";

function AuditDetailPage() {
    const { id, auditId } = Route.useParams();
    const router = useRouter();
    const [agent, setAgent] = useState<Agent | null>(null);
    const [token, setToken] = useState<string | undefined>();
    const [auditData, setAuditData] = useState<AuditResponse | null>(null);
    const [auditReport, setAuditReport] = useState<AuditReportResponse | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sectionFilter, setSectionFilter] = useState<string>("all");
    const [pillarFilter, setPillarFilter] = useState<SecurityPillar | "all">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<ViewMode>("pillar");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const a = await agentApi.getById(id);
                setAgent(a);
                setToken(getAgentToken(a.id) ?? undefined);
                
                const audit = await agentApi.getAuditById(id, auditId);
                console.log('Fetched audit:', audit);
                setAuditData(audit);

                try {
                    const report = await agentApi.getAuditReport(id, auditId);
                    setAuditReport(report);
                } catch (reportError) {
                    console.warn("Failed to load Rust audit report, using client fallback:", reportError);
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
                <Button variant="outline" onClick={() => router.history.back()}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
                </Button>
            </div>

            {auditData ? (
                <>
                    {/* ── Summary Card ────────────────────────────────── */}
                    <div className="rounded-2xl border border-border bg-card dark:bg-gradient-to-br dark:from-[#0A0A0B] dark:via-[#111113] dark:to-[#0A0A0B] overflow-hidden shadow-2xl">
                        {/* Terminal-style header with glow */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40 dark:bg-background dark:bg-[#09090B]/80 backdrop-blur-sm">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="flex gap-1.5">
                                    <div className="h-3 w-3 shrink-0 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                                    <div className="h-3 w-3 shrink-0 rounded-full bg-yellow-500/80 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                                    <div className="h-3 w-3 shrink-0 rounded-full bg-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                                </div>
                                <span className="ml-2 text-sm font-mono text-muted-foreground truncate">
                                    {agent?.name ?? id} <span className="text-muted-foreground/40">/</span> <span className="text-[#2496ED]">{auditData.hostname}</span>
                                </span>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground/60 shrink-0 ml-4">
                                {fmtDate(auditData.timestamp).split(",")[1]?.trim() ?? fmtDate(auditData.timestamp)}
                            </span>
                        </div>

                        {/* Body: score left + breakdown right */}
                        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
                            {/* Left: Score + stats */}
                            <div className="p-6 space-y-5">
                                <div>
                                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-3">Audit Score</p>
                                    <div className="flex items-baseline gap-3">
                                        <span className={cn("text-7xl font-black tabular-nums leading-none",
                                            auditData.summary.score >= 80 ? "text-emerald-400 dark:drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                                            : auditData.summary.score >= 60 ? "text-amber-400 dark:drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]"
                                            : "text-rose-400 dark:drop-shadow-[0_0_20px_rgba(251,113,133,0.4)]"
                                        )}>
                                            {auditData.summary.score}
                                        </span>
                                        <span className="text-xl text-muted-foreground/40 font-bold">/ 100</span>
                                    </div>
                                    <div className="mt-3 h-2 w-full rounded-full bg-muted/40 overflow-hidden shadow-inner">
                                        <div
                                            className={cn("h-full rounded-full transition-all duration-1000 ease-out",
                                                auditData.summary.score >= 80 ? "bg-gradient-to-r from-emerald-500 to-emerald-400 dark:shadow-[0_0_12px_rgba(52,211,153,0.6)]"
                                                : auditData.summary.score >= 60 ? "bg-gradient-to-r from-amber-500 to-amber-400 dark:shadow-[0_0_12px_rgba(251,191,36,0.6)]"
                                                : "bg-gradient-to-r from-rose-500 to-rose-400 dark:shadow-[0_0_12px_rgba(251,113,133,0.6)]"
                                            )}
                                            style={{ width: `${auditData.summary.score}%` }}
                                        />
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground/60 font-mono">CIS Docker Benchmark v1.8.0 · {auditData.summary.total} rules</p>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <button
                                        onClick={() => setStatusFilter(f => f === "Pass" ? "all" : "Pass")}
                                        className={cn(
                                            "flex flex-col items-center py-3 rounded-xl border transition-all duration-200",
                                            statusFilter === "Pass"
                                                ? "bg-emerald-500/20 border-emerald-500/50 ring-2 ring-emerald-500/30 dark:shadow-[0_0_20px_rgba(52,211,153,0.3)]"
                                                : "bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/30"
                                        )}
                                    >
                                        <span className="text-2xl font-black text-emerald-400">{auditData.summary.passed}</span>
                                        <span className="text-[9px] text-muted-foreground uppercase tracking-[0.15em] mt-1">Pass</span>
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter(f => f === "Fail" ? "all" : "Fail")}
                                        className={cn(
                                            "flex flex-col items-center py-3 rounded-xl border transition-all duration-200",
                                            statusFilter === "Fail"
                                                ? "bg-rose-500/20 border-rose-500/50 ring-2 ring-rose-500/30 shadow-[0_0_20px_rgba(251,113,133,0.3)]"
                                                : "bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10 hover:border-rose-500/30"
                                        )}
                                    >
                                        <span className="text-2xl font-black text-rose-400">{auditData.summary.failed}</span>
                                        <span className="text-[9px] text-muted-foreground uppercase tracking-[0.15em] mt-1">Fail</span>
                                    </button>
                                    <div className="flex flex-col items-center py-3 rounded-xl border border-border bg-muted/20">
                                        <span className="text-2xl font-black text-muted-foreground">{auditData.summary.total}</span>
                                        <span className="text-[9px] text-muted-foreground/60 uppercase tracking-[0.15em] mt-1">Total</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-2">
                                    {[
                                        { icon: Server, label: "Host", value: auditData.hostname },
                                        { icon: Cpu, label: "Docker", value: auditData.docker_version },
                                        { icon: Container, label: "Containers", value: String(auditData.total_containers) },
                                        { icon: Clock, label: "Ran", value: fmtDate(auditData.timestamp).split(",")[1]?.trim() ?? fmtDate(auditData.timestamp) },
                                    ].map(({ icon: Icon, label, value }) => (
                                        <div key={label} className="bg-muted/20 border border-white/5 rounded-lg px-3 py-2 flex items-center gap-2 min-w-0 hover:bg-white/[0.04] transition-colors">
                                            <Icon className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-[9px] text-muted-foreground/60 uppercase tracking-[0.15em]">{label}</p>
                                                <p className="text-xs font-semibold text-foreground/80 truncate">{value}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Pillar/Section breakdown with toggle */}
                            <div className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                                        {viewMode === "pillar" ? "Security Pillars" : "CIS Sections"}
                                    </p>
                                    <button
                                        onClick={() => setViewMode(m => m === "pillar" ? "section" : "pillar")}
                                        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-muted/20 border border-border hover:bg-primary/20 hover:border-primary/50 hover:text-primary transition-all text-muted-foreground"
                                    >
                                        <ArrowLeftRight className="h-3 w-3" />
                                        Switch to {viewMode === "pillar" ? "Sections" : "Pillars"}
                                    </button>
                                </div>
                                
                                {viewMode === "pillar" ? (
                                    // Pillar breakdown
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
                                                <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden shadow-inner">
                                                    <div
                                                        className={cn("h-full rounded-full transition-all duration-700", meta.barColor, 
                                                            pct > 0 && "shadow-[0_0_8px_currentColor]"
                                                        )}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    // Section breakdown
                                    sortedSections.map(s => (
                                        <SectionHeader key={s} section={s}
                                            total={sectionStats[s]?.total ?? 0}
                                            passed={sectionStats[s]?.passed ?? 0}
                                        />
                                    ))
                                )}

                                {/* Quick Stats */}
                                <div className="pt-4 mt-4 border-t border-border grid grid-cols-2 gap-2">
                                    <div className="bg-muted/20 border border-white/5 rounded-lg px-3 py-2">
                                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-[0.15em]">Critical</p>
                                        <p className="text-lg font-black text-rose-400">{report?.severity_failures.high ?? auditData.results.filter(r => r.rule.severity === "High" && r.status === "Fail").length}</p>
                                    </div>
                                    <div className="bg-muted/20 border border-white/5 rounded-lg px-3 py-2">
                                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-[0.15em]">Medium</p>
                                        <p className="text-lg font-black text-amber-400">{report?.severity_failures.medium ?? auditData.results.filter(r => r.rule.severity === "Medium" && r.status === "Fail").length}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

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
                    <div className="space-y-4">
                        {/* Search bar */}
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                            <Input
                                type="text"
                                placeholder="Search rules by ID, title, or message..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-11 pr-11 h-11 bg-muted/20 border-border text-foreground/90 placeholder:text-muted-foreground/60 focus:border-[#2496ED]/50 focus:ring-[#2496ED]/20"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground/80 transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {/* View mode toggle + filters */}
                        <div className="flex flex-wrap gap-3 items-center">
                            {/* View mode toggle */}
                            <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-muted/20">
                                <button
                                    onClick={() => setViewMode("pillar")}
                                    className={cn("flex items-center gap-1.5 text-xs px-3 py-2 rounded font-bold transition-all",
                                        viewMode === "pillar" ? "bg-[#2496ED] text-white dark:shadow-[0_0_12px_rgba(36,150,237,0.3)]" : "hover:bg-muted/40 text-muted-foreground")}
                                >
                                    <Layers className="h-3.5 w-3.5" />
                                    Pillars
                                </button>
                                <button
                                    onClick={() => setViewMode("section")}
                                    className={cn("flex items-center gap-1.5 text-xs px-3 py-2 rounded font-bold transition-all",
                                        viewMode === "section" ? "bg-[#2496ED] text-white dark:shadow-[0_0_12px_rgba(36,150,237,0.3)]" : "hover:bg-muted/40 text-muted-foreground")}
                                >
                                    <Terminal className="h-3.5 w-3.5" />
                                    Sections
                                </button>
                            </div>

                            <div className="h-6 w-px bg-white/10" />

                            {/* Pillar filters (only show in pillar view) */}
                            {viewMode === "pillar" && (
                                <>
                                    <span className="text-xs text-muted-foreground/60 font-semibold">Pillar:</span>
                                    <button
                                        onClick={() => setPillarFilter("all")}
                                        className={cn("text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                                            pillarFilter === "all" ? "bg-[#2496ED] text-white border-[#2496ED]/50 dark:shadow-[0_0_12px_rgba(36,150,237,0.3)]" : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
                                    >
                                        All
                                    </button>
                                    {(Object.keys(PILLAR_META) as SecurityPillar[]).map(pillar => {
                                        const meta = PILLAR_META[pillar];
                                        const Icon = meta.icon;
                                        return (
                                            <button key={pillar}
                                                onClick={() => setPillarFilter(f => f === pillar ? "all" : pillar)}
                                                className={cn("inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                                                    pillarFilter === pillar
                                                        ? cn(meta.bg, meta.color, meta.border, "shadow-sm")
                                                        : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
                                            >
                                                <Icon size={12} />
                                                {meta.name}
                                            </button>
                                        );
                                    })}
                                </>
                            )}

                            {/* Section filters (only show in section view) */}
                            {viewMode === "section" && (
                                <>
                                    <span className="text-xs text-muted-foreground/60 font-semibold">Section:</span>
                                    <button
                                        onClick={() => setSectionFilter("all")}
                                        className={cn("text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                                            sectionFilter === "all" ? "bg-[#2496ED] text-white border-[#2496ED]/50 dark:shadow-[0_0_12px_rgba(36,150,237,0.3)]" : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
                                    >
                                        All
                                    </button>
                                    {sortedSections.map(s => {
                                        const meta = sectionMeta(s);
                                        return (
                                            <button key={s}
                                                onClick={() => setSectionFilter(f => f === s ? "all" : s)}
                                                className={cn("text-xs px-3 py-1.5 rounded-lg border font-bold transition-all",
                                                    sectionFilter === s
                                                        ? cn(meta.bg, meta.color, meta.border, "shadow-sm")
                                                        : "bg-muted/20 border-border text-muted-foreground hover:bg-muted/40")}
                                            >
                                                {meta.num} {meta.label}
                                            </button>
                                        );
                                    })}
                                </>
                            )}

                            {/* Clear filters */}
                            {(statusFilter !== "all" || sectionFilter !== "all" || pillarFilter !== "all" || searchQuery) && (
                                <button
                                    onClick={() => { 
                                        setStatusFilter("all"); 
                                        setSectionFilter("all"); 
                                        setPillarFilter("all");
                                        setSearchQuery("");
                                    }}
                                    className="text-xs px-3 py-1.5 text-muted-foreground hover:text-rose-400 ml-auto font-bold transition-colors"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>
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
                                            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
                                                <Icon size={16} className={meta.color} />
                                                <span className={cn("text-sm font-black px-3 py-1.5 rounded-lg border inline-flex items-center gap-2", meta.bg, meta.color, meta.border)}>
                                                    {groupName}
                                                </span>
                                                <Badge variant="outline" className="text-xs ml-auto font-mono font-bold bg-muted/20 border-border text-muted-foreground">
                                                    {results.filter(r => r.status === "Pass").length}/{results.length}
                                                </Badge>
                                            </div>
                                            <div className="space-y-3">
                                                {results
                                                    .map(r => (
                                                        <RuleCard
                                                            key={r.rule.id}
                                                            result={r}
                                                            agentId={id}
                                                            agentUrl={agent?.url ?? ""}
                                                            agentAccessMode={agent?.access_mode}
                                                            token={token}
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
                                            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
                                                <span className={cn("text-sm font-black px-3 py-1.5 rounded-lg border", meta.bg, meta.color, meta.border)}>
                                                    {meta.num} {meta.label}
                                                </span>
                                                <span className="text-sm text-muted-foreground font-medium">{groupName}</span>
                                                <Badge variant="outline" className="text-xs ml-auto font-mono font-bold bg-muted/20 border-border text-muted-foreground">
                                                    {results.filter(r => r.status === "Pass").length}/{results.length}
                                                </Badge>
                                            </div>
                                            <div className="space-y-3">
                                                {results
                                                    .map(r => (
                                                        <RuleCard
                                                            key={r.rule.id}
                                                            result={r}
                                                            agentId={id}
                                                            agentUrl={agent?.url ?? ""}
                                                            agentAccessMode={agent?.access_mode}
                                                            token={token}
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
        </div>
    );
}
