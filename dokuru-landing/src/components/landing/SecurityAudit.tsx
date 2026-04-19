import { Server, Settings2, FileLock, Container, Play, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "S1", label: "Host Configuration",     desc: "Kernel params, Docker user, auditd rules, filesystem security.",  icon: Server,    color: "text-audit-blue",   bg: "bg-audit-blue/10",   border: "border-audit-blue/30" },
  { id: "S2", label: "Daemon Configuration",   desc: "daemon.json flags, TLS configuration, logging, user namespaces.", icon: Settings2, color: "text-audit-violet", bg: "bg-audit-violet/10", border: "border-audit-violet/30" },
  { id: "S3", label: "File Permissions",       desc: "Ownership and permissions for Docker socket and config files.",    icon: FileLock,  color: "text-audit-orange", bg: "bg-audit-orange/10", border: "border-audit-orange/30" },
  { id: "S4", label: "Container Images",       desc: "Trusted base images, non-root users, no secrets in layers.",      icon: Container, color: "text-audit-teal",   bg: "bg-audit-teal/10",   border: "border-audit-teal/30" },
  { id: "S5", label: "Container Runtime",      desc: "Privileged flags, capabilities, AppArmor, resource limits.",      icon: Play,      color: "text-audit-indigo", bg: "bg-audit-indigo/10", border: "border-audit-indigo/30" },
];

const STATUSES = [
  { label: "PASS",  icon: CheckCircle2,   color: "text-green-600  dark:text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30" },
  { label: "WARN",  icon: AlertTriangle,  color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  { label: "FAIL",  icon: XCircle,        color: "text-red-600    dark:text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30" },
];

export function SecurityAudit() {
  return (
    <section id="security-audit" className="py-24 sm:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-dot-grid opacity-40 pointer-events-none" />
      <div className="absolute -right-40 top-20 w-[400px] h-[400px] rounded-full bg-audit-violet/10 blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-audit-violet/30 bg-audit-violet/10 text-[11px] font-mono font-semibold uppercase tracking-wider text-audit-violet mb-4">
            Security · CIS Benchmark
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Automated Docker Security Audits
          </h2>
          <p className="text-muted-foreground text-lg">
            Dokuru runs 35+ checks across 5 CIS Benchmark sections, classifies
            each finding as PASS / WARN / FAIL, and offers guided remediation.
          </p>
        </div>

        {/* CIS sections grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {SECTIONS.map(({ id, label, desc, icon: Icon, color, bg, border }) => (
            <div
              key={id}
              className="relative rounded-2xl border border-border bg-card p-5 hover:border-primary/30 transition-all overflow-hidden group"
            >
              {/* Top accent line */}
              <div className={cn("absolute inset-x-0 top-0 h-px", bg.replace("/10", "/60"))} />
              <div className="flex items-center justify-between mb-4">
                <span className={cn("text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border", bg, color, border)}>
                  {id}
                </span>
                <div className={cn("h-8 w-8 rounded-lg border flex items-center justify-center", bg, border)}>
                  <Icon className={cn("h-4 w-4", color)} />
                </div>
              </div>
              <h3 className="text-sm font-semibold mb-1.5">{label}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Status legend */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground max-w-sm">
            Each check is classified as{" "}
            <span className="font-semibold text-foreground">PASS, WARN, or FAIL</span> with
            specific remediation steps — AUTO, GUIDED, or MANUAL.
          </p>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {STATUSES.map(({ label, icon: Icon, color, bg, border }) => (
              <span
                key={label}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border",
                  bg, color, border
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
