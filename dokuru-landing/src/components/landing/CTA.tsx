import { useState } from "react";
import { ArrowRight, Check, Copy, Github } from "lucide-react";
import { Button } from "@/components/ui/button";

const INSTALL_CMD = "curl -fsSL https://dokuru.rifuki.dev/install | bash";

export function CTA() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="py-24 sm:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-8">
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">
          Ready to secure your{" "}
          <span className="gradient-text">Docker hosts?</span>
        </h2>

        <p className="text-lg text-muted-foreground">
          Self-hosted, MIT licensed, no subscriptions. Install the agent in 30
          seconds and start your first audit today.
        </p>

        {/* Install command */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-5 py-4 max-w-lg mx-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="h-2 w-2 rounded-full bg-red-500/70" />
            <div className="h-2 w-2 rounded-full bg-yellow-500/70" />
            <div className="h-2 w-2 rounded-full bg-green-500/70" />
          </div>
          <code className="text-sm font-mono text-muted-foreground flex-1 truncate text-left ml-2">
            $ {INSTALL_CMD}
          </code>
          <button
            onClick={copy}
            className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Copy install command"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg" asChild>
            <a href="https://app.dokuru.rifuki.dev">
              Open Dashboard <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="https://github.com/rifuki/dokuru" target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4" /> View on GitHub
            </a>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          MIT Licensed · Self-hosted · No telemetry
        </p>
      </div>
    </section>
  );
}
