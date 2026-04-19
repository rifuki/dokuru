import { ArrowRight, Github, Server, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuditPanel } from "./AuditPanel";

const INSTALL_CMD = "curl -fsSL https://dokuru.rifuki.dev/install | bash";

const BULLETS = [
  { icon: Server,       text: "Agent-based Docker host inspection" },
  { icon: ShieldCheck,  text: "CIS Benchmark v1.8.0 aligned checks" },
  { icon: Zap,          text: "One-click auto-remediation" },
];

export function Hero() {
  const copyInstall = () => {
    void navigator.clipboard.writeText(INSTALL_CMD);
  };

  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-dot-grid opacity-60 pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-primary/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full bg-secondary/10 blur-[100px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Copy */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/25 bg-primary/8 text-xs font-mono font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              CIS Docker Benchmark v1.8.0 · Aligned
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-bold leading-[1.1] tracking-tight">
              Monitor Docker Security
              <br />
              <span className="gradient-text">Across Your Infrastructure</span>
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
              Dokuru audits your Docker hosts using CIS-aligned checks. Detect
              misconfigurations, visualize risk, and apply fixes — all from one
              self-hosted dashboard.
            </p>

            {/* Bullets */}
            <ul className="space-y-2.5">
              {BULLETS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="h-6 w-6 rounded-md border border-primary/20 bg-primary/8 flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  {text}
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <a href="https://app.dokuru.rifuki.dev">
                  Start Free Audit <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="https://github.com/rifuki/dokuru" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" /> View on GitHub
                </a>
              </Button>
            </div>

            {/* Install command */}
            <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-3 max-w-md">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="h-2 w-2 rounded-full bg-red-500/70" />
                <div className="h-2 w-2 rounded-full bg-yellow-500/70" />
                <div className="h-2 w-2 rounded-full bg-green-500/70" />
              </div>
              <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
                $ {INSTALL_CMD}
              </code>
              <button
                onClick={copyInstall}
                className="text-[10px] font-mono text-primary hover:text-primary/80 transition-colors shrink-0"
              >
                copy
              </button>
            </div>
          </div>

          {/* AuditPanel */}
          <div className="w-full">
            <AuditPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
