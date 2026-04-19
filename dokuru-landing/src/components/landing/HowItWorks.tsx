import { useState } from "react";
import { Check, Copy } from "lucide-react";

const INSTALL_CMD = "curl -fsSL https://dokuru.rifuki.dev/install | bash";

const STEPS = [
  {
    num: "01",
    title: "Install the agent",
    desc: "Run one command on your Docker host. The agent installs as a systemd service and starts immediately.",
    terminal: true,
  },
  {
    num: "02",
    title: "Connect to dashboard",
    desc: "Add your host in the Dokuru dashboard using the API key shown after installation. No port forwarding needed — the agent connects out.",
    terminal: false,
  },
  {
    num: "03",
    title: "Run audit & fix",
    desc: "Trigger a CIS Benchmark audit from the dashboard. Review findings by section and apply auto-fixes or follow guided remediation steps.",
    terminal: false,
  },
];

export function HowItWorks() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section id="how-it-works" className="py-24 sm:py-32 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            How It Works
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Up and running in minutes
          </h2>
          <p className="text-muted-foreground text-lg">
            No cloud dependencies. No open inbound ports. Just a single curl
            command and you're connected.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map((step, i) => (
            <div key={step.num} className="relative">
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-5 left-full w-full h-px bg-gradient-to-r from-border to-transparent -translate-y-0.5 z-0" />
              )}

              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                    STEP {step.num}
                  </span>
                </div>

                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>

                {step.terminal && (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-muted/30">
                      <div className="h-2 w-2 rounded-full bg-red-500/70" />
                      <div className="h-2 w-2 rounded-full bg-yellow-500/70" />
                      <div className="h-2 w-2 rounded-full bg-green-500/70" />
                    </div>
                    <div className="flex items-center gap-2 px-4 py-3">
                      <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
                        $ {INSTALL_CMD}
                      </code>
                      <button
                        onClick={copy}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Copy"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
