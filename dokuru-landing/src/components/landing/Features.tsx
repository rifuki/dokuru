import { Monitor, ShieldCheck, Zap, Box, Radio, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Monitor,
    title: "Multi-Host Monitoring",
    desc: "Connect any number of Docker hosts via a lightweight agent. Monitor all of them from a single dashboard.",
    color: "text-primary bg-primary/10 border-primary/20",
  },
  {
    icon: ShieldCheck,
    title: "CIS Security Audits",
    desc: "Run full CIS Docker Benchmark v1.8.0 audits across 5 sections and 35+ checks with detailed findings.",
    color: "text-audit-violet bg-audit-violet/10 border-audit-violet/20",
  },
  {
    icon: Zap,
    title: "Auto Remediation",
    desc: "Apply AUTO fixes with a single click. GUIDED fixes walk you through the steps. MANUAL fixes link to docs.",
    color: "text-audit-teal bg-audit-teal/10 border-audit-teal/20",
  },
  {
    icon: Box,
    title: "Container Management",
    desc: "Browse containers, images, volumes, and networks. Inspect runtime configs and resource usage.",
    color: "text-audit-orange bg-audit-orange/10 border-audit-orange/20",
  },
  {
    icon: Radio,
    title: "Real-time Events",
    desc: "Stream Docker events live via WebSocket. See container starts, stops, and system events as they happen.",
    color: "text-audit-indigo bg-audit-indigo/10 border-audit-indigo/20",
  },
  {
    icon: Users,
    title: "Role-Based Access",
    desc: "Multi-user support with scoped API keys. Each team member gets access to only what they need.",
    color: "text-audit-blue bg-audit-blue/10 border-audit-blue/20",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Features
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Everything you need to secure Docker
          </h2>
          <p className="text-muted-foreground text-lg">
            From audit to remediation, Dokuru covers the full security lifecycle
            of your Docker infrastructure.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div
              key={title}
              className="group relative rounded-2xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-sm transition-all"
            >
              <div className={cn("h-10 w-10 rounded-xl border flex items-center justify-center mb-4", color)}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-sm mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
