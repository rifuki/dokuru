import { ArrowRight, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuditPanel } from "./AuditPanel";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Subtle background */}
      <div className="absolute inset-0 bg-dot-grid opacity-50 pointer-events-none" />
      <div className="absolute -top-32 left-1/3 w-[700px] h-[500px] rounded-full bg-primary/10 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full bg-secondary/8 blur-[100px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left: copy */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-mono text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              CIS Docker Benchmark v1.8.0
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold leading-[1.05] tracking-tight">
              Docker security,{" "}
              <span className="gradient-text">finally visible.</span>
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
              Dokuru runs CIS Benchmark audits on your Docker hosts, shows exactly what's wrong, and fixes it — automatically.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" asChild>
                <a href="https://app.dokuru.rifuki.dev">
                  Start Free Audit <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="https://github.com/rifuki/dokuru" target="_blank" rel="noopener noreferrer">
                  <Github className="h-4 w-4" /> GitHub
                </a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Self-hosted · MIT Licensed · No telemetry
            </p>
          </div>

          {/* Right: AuditPanel */}
          <div>
            <AuditPanel />
          </div>
        </div>
      </div>
    </section>
  );
}
