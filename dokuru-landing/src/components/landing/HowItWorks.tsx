// @ts-nocheck
import { useState } from "react";
import { Copy, Check, Zap, ShieldCheck } from "lucide-react";

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
              <div className="rounded-xl border border-white/10 bg-[#050505] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
                <div className="flex items-center px-4 py-3 border-b border-white/10 bg-[#0d0d0f]">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500 ml-3">
                    Security Audit · CIS Docker Benchmark v1.8.0
                  </span>
                </div>

                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">Audit Score</h3>
                      <p className="text-sm text-zinc-400">Production Server · 2 containers</p>
                    </div>
                    <div className="text-right">
                      <div className="text-4xl font-black text-rose-400">45</div>
                      <div className="text-sm text-zinc-500">/ 100</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-400">16</div>
                      <div className="text-xs text-zinc-400 mt-1">PASS</div>
                    </div>
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-rose-400">19</div>
                      <div className="text-xs text-zinc-400 mt-1">FAIL</div>
                    </div>
                    <div className="bg-zinc-500/10 border border-zinc-500/30 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-zinc-400">35</div>
                      <div className="text-xs text-zinc-400 mt-1">TOTAL</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="bg-[#0d0d0f] border border-rose-500/30 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-xs font-bold">
                          2.10
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">User namespace support</div>
                          <div className="text-xs text-zinc-500">Containers run as root on host</div>
                        </div>
                      </div>
                      <button className="bg-[#2496ED] hover:bg-[#2496ED]/90 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors">
                        <Zap size={12} /> Auto Fix
                      </button>
                    </div>

                    <div className="bg-[#0d0d0f] border border-emerald-500/30 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xs font-bold">
                          3.8
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">File permissions secured</div>
                          <div className="text-xs text-zinc-500">Docker files properly protected</div>
                        </div>
                      </div>
                      <div className="text-emerald-400 flex items-center gap-1.5">
                        <ShieldCheck size={16} />
                      </div>
                    </div>

                    <div className="bg-[#0d0d0f] border border-rose-500/30 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-xs font-bold">
                          5.12
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">Host PID namespace</div>
                          <div className="text-xs text-zinc-500">Container shares host PID</div>
                        </div>
                      </div>
                      <button className="bg-[#2496ED] hover:bg-[#2496ED]/90 text-white text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors">
                        <Zap size={12} /> Auto Fix
                      </button>
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
