import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { agentApi } from "@/lib/api/agent";
import { agentDirectApi, type AuditResponse } from "@/lib/api/agent-direct";
import type { Agent } from "@/types/agent";
import { getAgentToken } from "@/stores/use-agent-store";
import { Button } from "@/components/ui/button";
import { Play, CheckCircle2, XCircle, AlertCircle, Filter, ChevronDown, ChevronUp, ExternalLink, Terminal, Wrench, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const Route = createFileRoute("/_authenticated/agents/$id/audit")({
    component: AuditPage,
});

type FilterType = "all" | "pass" | "fail" | "warn";

function AuditPage() {
    const { id } = Route.useParams();
    const [agent, setAgent] = useState<Agent | null>(null);
    const [auditResults, setAuditResults] = useState<AuditResponse | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [filter, setFilter] = useState<FilterType>("all");
    const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

    useEffect(() => {
        agentApi.getById(id).then(setAgent).catch(() => toast.error("Failed to load agent"));
    }, [id]);

    const handleRunAudit = async () => {
        if (!agent) return;
        const token = getAgentToken(agent.id);
        if (!token) return toast.error("Agent token not found");

        setIsRunning(true);
        try {
            const results = await agentDirectApi.runAudit(agent.url, token);
            setAuditResults(results);
            toast.success("Audit completed");
        } catch {
            toast.error("Failed to run audit");
        } finally {
            setIsRunning(false);
        }
    };

    const toggleRule = (ruleId: string) => {
        setExpandedRules(prev => {
            const next = new Set(prev);
            if (next.has(ruleId)) {
                next.delete(ruleId);
            } else {
                next.add(ruleId);
            }
            return next;
        });
    };

    const filteredResults = auditResults?.results.filter((r) => {
        if (filter === "all") return true;
        return r.status === filter;
    });

    const getSeverityColor = (severity?: string) => {
        switch (severity) {
            case "High": return "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20";
            case "Medium": return "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
            case "Low": return "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20";
            default: return "text-gray-600 dark:text-gray-400 bg-gray-500/10 border-gray-500/20";
        }
    };

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Security Audit</h2>
                    <p className="text-muted-foreground text-sm mt-1">CIS Docker Benchmark v1.8.0 - Namespace & Cgroup Security</p>
                </div>
                <Button onClick={handleRunAudit} disabled={isRunning || !agent}>
                    <Play className={`h-4 w-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
                    {isRunning ? "Running..." : "Run Audit"}
                </Button>
            </div>

            {auditResults ? (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-4">
                        <button
                            onClick={() => setFilter(filter === "pass" ? "all" : "pass")}
                            className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${
                                filter === "pass"
                                    ? "bg-green-500/20 border-green-500/40 ring-2 ring-green-500/30"
                                    : "bg-green-500/10 border-green-500/20 hover:bg-green-500/15"
                            }`}
                        >
                            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0" />
                            <div className="text-left">
                                <p className="text-3xl font-bold">{auditResults.passed}</p>
                                <p className="text-sm text-muted-foreground">Passed</p>
                            </div>
                        </button>
                        <button
                            onClick={() => setFilter(filter === "fail" ? "all" : "fail")}
                            className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${
                                filter === "fail"
                                    ? "bg-red-500/20 border-red-500/40 ring-2 ring-red-500/30"
                                    : "bg-red-500/10 border-red-500/20 hover:bg-red-500/15"
                            }`}
                        >
                            <XCircle className="h-6 w-6 text-red-600 dark:text-red-400 shrink-0" />
                            <div className="text-left">
                                <p className="text-3xl font-bold">{auditResults.failed}</p>
                                <p className="text-sm text-muted-foreground">Failed</p>
                            </div>
                        </button>
                        <button
                            onClick={() => setFilter(filter === "warn" ? "all" : "warn")}
                            className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${
                                filter === "warn"
                                    ? "bg-yellow-500/20 border-yellow-500/40 ring-2 ring-yellow-500/30"
                                    : "bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/15"
                            }`}
                        >
                            <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400 shrink-0" />
                            <div className="text-left">
                                <p className="text-3xl font-bold">{auditResults.warned}</p>
                                <p className="text-sm text-muted-foreground">Warnings</p>
                            </div>
                        </button>
                    </div>

                    {/* Filter Info */}
                    {filter !== "all" && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Filter className="h-4 w-4" />
                            <span>
                                Showing {filteredResults?.length} {filter === "pass" ? "passed" : filter === "fail" ? "failed" : "warning"} results
                            </span>
                            <button
                                onClick={() => setFilter("all")}
                                className="text-primary hover:underline ml-2"
                            >
                                Clear filter
                            </button>
                        </div>
                    )}

                    {/* Audit Results */}
                    <div className="space-y-3">
                        {filteredResults?.map((result) => {
                            const isExpanded = expandedRules.has(result.rule_id);
                            return (
                                <Collapsible
                                    key={result.rule_id}
                                    open={isExpanded}
                                    onOpenChange={() => toggleRule(result.rule_id)}
                                >
                                    <div
                                        className={`rounded-lg border ${
                                            result.status === "pass"
                                                ? "bg-green-500/5 border-green-500/20"
                                                : result.status === "fail"
                                                ? "bg-red-500/5 border-red-500/20"
                                                : "bg-yellow-500/5 border-yellow-500/20"
                                        }`}
                                    >
                                        <CollapsibleTrigger className="w-full p-5 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                            <div className="flex items-start gap-4">
                                                {result.status === "pass" ? (
                                                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-1 shrink-0" />
                                                ) : result.status === "fail" ? (
                                                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-1 shrink-0" />
                                                ) : (
                                                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-1 shrink-0" />
                                                )}
                                                <div className="flex-1 min-w-0 space-y-2">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1">
                                                            <h3 className="font-semibold text-base leading-tight">{result.title}</h3>
                                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                                <Badge variant="outline" className="font-mono text-xs">
                                                                    {result.rule_id}
                                                                </Badge>
                                                                <Badge
                                                                    variant={
                                                                        result.status === "pass"
                                                                            ? "default"
                                                                            : result.status === "fail"
                                                                            ? "destructive"
                                                                            : "secondary"
                                                                    }
                                                                    className="text-xs uppercase"
                                                                >
                                                                    {result.status}
                                                                </Badge>
                                                                {result.severity && (
                                                                    <Badge variant="outline" className={`text-xs ${getSeverityColor(result.severity)}`}>
                                                                        {result.severity}
                                                                    </Badge>
                                                                )}
                                                                {result.category && (
                                                                    <Badge variant="outline" className="text-xs">
                                                                        {result.category}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {isExpanded ? (
                                                            <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                                                        ) : (
                                                            <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                                        {result.message}
                                                    </p>
                                                </div>
                                            </div>
                                        </CollapsibleTrigger>

                                        <CollapsibleContent>
                                            <div className="px-5 pb-5 space-y-4 border-t border-border/50 pt-4">
                                                {/* Description */}
                                                {result.description && (
                                                    <div>
                                                        <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                                                            <Info className="h-4 w-4" />
                                                            Description
                                                        </h4>
                                                        <p className="text-sm text-muted-foreground">{result.description}</p>
                                                    </div>
                                                )}

                                                {/* Affected Containers */}
                                                {result.affected && result.affected.length > 0 && (
                                                    <div>
                                                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                                                            Affected Containers ({result.affected.length})
                                                        </h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {result.affected.map((container, idx) => (
                                                                <Badge key={idx} variant="secondary" className="font-mono text-xs">
                                                                    {container}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Remediation */}
                                                {result.remediation && (
                                                    <div>
                                                        <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                                                            <Wrench className="h-4 w-4" />
                                                            Remediation
                                                        </h4>
                                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted/50 p-3 rounded">
                                                            {result.remediation}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Audit Command */}
                                                {result.audit_command && (
                                                    <div>
                                                        <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                                                            <Terminal className="h-4 w-4" />
                                                            Audit Command
                                                        </h4>
                                                        <code className="text-xs bg-muted/50 p-3 rounded block overflow-x-auto">
                                                            {result.audit_command}
                                                        </code>
                                                    </div>
                                                )}

                                                {/* Raw Output */}
                                                {result.raw_output && (
                                                    <div>
                                                        <h4 className="text-sm font-semibold mb-1">Raw Output</h4>
                                                        <pre className="text-xs bg-muted/50 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                                                            {result.raw_output}
                                                        </pre>
                                                    </div>
                                                )}

                                                {/* External References */}
                                                {result.references && result.references.length > 0 && (
                                                    <div>
                                                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                                            <ExternalLink className="h-4 w-4" />
                                                            References
                                                        </h4>
                                                        <div className="space-y-1">
                                                            {result.references.map((ref, idx) => (
                                                                <a
                                                                    key={idx}
                                                                    href={ref}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-sm text-primary hover:underline flex items-center gap-1"
                                                                >
                                                                    <ExternalLink className="h-3 w-3" />
                                                                    {ref}
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Rationale & Impact */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {result.rationale && (
                                                        <div>
                                                            <h4 className="text-sm font-semibold mb-1">Rationale</h4>
                                                            <p className="text-sm text-muted-foreground">{result.rationale}</p>
                                                        </div>
                                                    )}
                                                    {result.impact && (
                                                        <div>
                                                            <h4 className="text-sm font-semibold mb-1">Impact</h4>
                                                            <p className="text-sm text-muted-foreground">{result.impact}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </CollapsibleContent>
                                    </div>
                                </Collapsible>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="rounded-lg border bg-card p-12 text-center">
                    <p className="text-muted-foreground">Click "Run Audit" to start CIS Docker Benchmark security audit</p>
                </div>
            )}
        </div>
    );
}
