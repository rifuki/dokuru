// @ts-nocheck
import { useState } from "react";
import { Copy, Check, Zap, ShieldCheck, Box, Gauge, Shield } from "lucide-react";

const steps = [
  {
    num: "01",
    title: "Install the agent",
    body: "Run one command to install the agent. It auto-configures, starts a Cloudflare Tunnel, and generates your credentials.",
  },
  {
    num: "02",
    title: "Add to dashboard",
    body: "Copy the agent URL and token from the install output, then add it to your dashboard to connect.",
  },
  {
    num: "03",
    title: "Run security audit",
    body: "Click 'Run Audit' from the dashboard to scan your Docker host against CIS benchmarks and apply fixes.",
  },
];

const HowItWorks = () => {
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const handleCopy = () => {
    navigator.clipboard.writeText(
      "curl -fsSL https://dokuru.rifuki.dev/install | bash"
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section
      id="how-it-works"
      data-testid="how-it-works-section"
      className="relative py-24 md:py-32 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="mb-14 max-w-3xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4">
            / how it works
          </div>
          <h2 className="font-heading text-4xl md:text-5xl font-black tracking-tighter text-white leading-[1.05]">
            Three steps from
            <br />
            install to audit.
          </h2>
        </div>

        <div className="grid lg:grid-cols-12 gap-10 items-start">
          {/* Steps */}
          <ol className="lg:col-span-5 space-y-8">
            {steps.map((s, i) => (
              <li
                key={s.num}
                data-testid={`how-step-${s.num}`}
                className="grid grid-cols-[auto_1fr] gap-5 cursor-pointer group"
                onClick={() => setActiveStep(i)}
              >
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-md border ${activeStep === i ? 'border-[#2496ED] bg-[#2496ED]/10' : 'border-white/15 bg-[#09090B]'} grid place-items-center font-mono text-sm text-[#2496ED] transition-all`}>
                    {s.num}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 bg-gradient-to-b from-[#2496ED]/40 to-transparent mt-2" />
                  )}
                </div>
                <div className="pb-4">
                  <h3 className={`font-heading text-xl md:text-2xl font-bold ${activeStep === i ? 'text-white' : 'text-zinc-400'} group-hover:text-white transition-colors`}>
                    {s.title}
                  </h3>
                  <p className="mt-2 text-zinc-400 text-[15px] leading-relaxed max-w-md">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* Visual Mockups */}
          <div className="lg:col-span-7">
            {/* Step 1: Terminal */}
            {activeStep === 0 && (
              <div className="rounded-xl border border-white/10 bg-[#050505] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
                <div className="flex items-center px-4 py-3 border-b border-white/10 bg-[#0d0d0f]">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500 ml-3">
                    bash · docker-host-01
                  </span>
                  <button
                    onClick={handleCopy}
                    className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400 hover:text-white border border-white/10 hover:border-white/25 rounded px-2 py-1 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check size={11} /> copied
                      </>
                    ) : (
                      <>
                        <Copy size={11} /> copy
                      </>
                    )}
                  </button>
                </div>

                <div className="p-6 font-mono text-[13px] leading-7 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-[#2496ED]">$</span>
                    <div className="flex-1">
                      <span className="text-zinc-100">curl -fsSL </span>
                      <span className="text-[#00E5FF]">https://dokuru.rifuki.dev/install</span>
                      <span className="text-zinc-100"> | bash</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/5 text-[12px] space-y-2 text-zinc-400">
                    <div className="text-emerald-400">✓ Agent installed to /usr/local/bin/dokuru</div>
                    <div className="text-emerald-400">✓ Cloudflare Tunnel started</div>
                    <div className="text-emerald-400">✓ Service enabled and running</div>
                    
                    <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                      <div className="text-zinc-500 text-[11px]">→ Next steps:</div>
                      <div className="pl-3">
                        <div className="text-zinc-300">Agent URL: <span className="text-[#00E5FF]">https://xxx.trycloudflare.com</span></div>
                        <div className="text-zinc-300">Token: <span className="text-amber-300">dok_cbb8becb44ca7ace...</span></div>
                      </div>
                      <div className="text-zinc-500 text-[11px] pl-3 mt-2">
                        → Add these to your dashboard
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Add Agent Form */}
            {activeStep === 1 && (
              <div className="rounded-xl border border-white/10 bg-[#050505] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
                <div className="flex items-center px-4 py-3 border-b border-white/10 bg-[#0d0d0f]">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500 ml-3">
                    app.dokuru.rifuki.dev
                  </span>
                </div>

                <div className="p-6 space-y-5">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Add Docker Agent</h3>
                    <p className="text-sm text-zinc-400">Connect a new Docker agent to start auditing.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Name</label>
                      <div className="bg-[#0d0d0f] border border-white/10 rounded-lg px-3 py-2.5 text-zinc-400 text-sm">
                        Production Server
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Access Mode</label>
                      <div className="bg-[#0d0d0f] border border-[#2496ED]/30 rounded-lg px-3 py-2.5 text-zinc-300 text-sm flex items-center gap-2">
                        <span className="text-[#2496ED]">☁</span> Cloudflare Tunnel (Recommended)
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Agent URL</label>
                      <div className="bg-[#0d0d0f] border border-white/10 rounded-lg px-3 py-2.5 text-[#00E5FF] text-sm font-mono">
                        https://xxx.trycloudflare.com
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">Agent Token</label>
                      <div className="bg-[#0d0d0f] border border-white/10 rounded-lg px-3 py-2.5 text-amber-300 text-sm font-mono">
                        dok_••••••••••••••••
                      </div>
                      <p className="text-xs text-zinc-500 mt-1.5">Token from agent onboarding (shown once)</p>
                    </div>

                    <button className="w-full bg-[#2496ED] hover:bg-[#2496ED]/90 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                      Add Agent
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Audit Results */}
            {activeStep === 2 && (
              <div className="rounded-xl border border-white/10 bg-[#09090B] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
                <div className="flex items-center px-4 py-3 border-b border-white/10 bg-[#121214]">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500 ml-3">
                    dokuru-agent <span className="text-zinc-700">~</span>{" "}
                    <span className="text-zinc-400">target:</span>{" "}
                    <span className="text-[#2496ED]">prod-cluster-01</span>
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                    live
                  </span>
                </div>

                <div className="p-6 space-y-5">
                  {/* Score */}
                  <div className="flex items-end justify-between border-b border-white/5 pb-5">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1.5">
                        audit score
                      </div>
                      <div className="flex items-baseline gap-1 font-heading">
                        <span className="text-5xl font-black text-emerald-400 leading-none">78</span>
                        <span className="text-lg text-zinc-600 font-bold">/ 100</span>
                      </div>
                      <div className="mt-2 text-xs text-zinc-500 font-mono">
                        CIS-aligned · 42 rules evaluated
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 text-right">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-sm bg-rose-500" />
                        <span className="font-mono text-xs text-zinc-300">
                          <span className="text-rose-400 font-semibold">7</span> failed
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-sm bg-amber-400" />
                        <span className="font-mono text-xs text-zinc-300">
                          <span className="text-amber-400 font-semibold">3</span> warnings
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-sm bg-emerald-400" />
                        <span className="font-mono text-xs text-zinc-300">
                          <span className="text-emerald-400 font-semibold">32</span> passed
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sections */}
                  <div className="space-y-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      security pillars
                    </div>

                    {/* Namespace */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded border text-blue-400 border-blue-500/30 bg-white/[0.02]">
                          <Box size={11} />
                          Namespace Isolation
                        </span>
                        <span className="font-mono text-[10px] text-zinc-600">1/5</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: "20%" }} />
                      </div>
                    </div>

                    {/* Cgroup */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded border text-amber-400 border-amber-500/30 bg-white/[0.02]">
                          <Gauge size={11} />
                          Cgroup Controls
                        </span>
                        <span className="font-mono text-[10px] text-zinc-600">2/5</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: "40%" }} />
                      </div>
                    </div>

                    {/* Runtime */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded border text-rose-400 border-rose-500/30 bg-white/[0.02]">
                          <Shield size={11} />
                          Runtime Hardening
                        </span>
                        <span className="font-mono text-[10px] text-zinc-600">3/6</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500" style={{ width: "50%" }} />
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between border-t border-white/5 pt-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                      run · 2s ago
                    </div>
                    <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#2496ED]">
                      apply auto-fixes (3)
                      <span>→</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600 flex justify-between">
              <span>// click steps to preview</span>
              <span>linux · x86_64 / arm64</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
