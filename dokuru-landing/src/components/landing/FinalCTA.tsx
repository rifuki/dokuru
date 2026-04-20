import { ArrowRight, Terminal } from "lucide-react";

const FinalCTA = () => {
  return (
    <section
      id="cta"
      data-testid="final-cta-section"
      className="relative py-24 md:py-32 border-t border-white/5"
    >
      <div className="max-w-6xl mx-auto px-6 md:px-10">
        <div className="relative rounded-2xl border border-white/10 bg-[#09090B] overflow-hidden">
          {/* radial accent */}
          <div className="absolute inset-0 pointer-events-none bg-grid-fine opacity-60" />
          <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-[#2496ED]/15 blur-[120px] pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-[420px] h-[420px] rounded-full bg-[#00E5FF]/10 blur-[120px] pointer-events-none" />

          <div className="relative p-10 md:p-16 grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4">
                / start auditing
              </div>
              <h2 className="font-heading text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter text-white leading-[1.02]">
                Start auditing Docker
                <br />
                security with Dokuru.
              </h2>
              <p className="mt-5 text-zinc-400 text-lg max-w-xl">
                Connect your Docker hosts, run isolation-focused audits, and
                apply supported fixes — from one dashboard.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#register"
                  data-testid="final-cta-primary"
                  className="group inline-flex items-center gap-2 bg-[#2496ED] hover:bg-[#1C7CBA] text-white font-medium px-6 py-3.5 rounded-md shadow-[0_0_48px_-8px_rgba(36,150,237,0.7)] transition-all"
                >
                  Get Started
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </a>
                <a
                  href="#how-it-works"
                  data-testid="final-cta-secondary"
                  className="inline-flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/25 text-white font-medium px-6 py-3.5 rounded-md transition-all"
                >
                  <Terminal size={16} className="text-[#2496ED]" />
                  View Audit Workflow
                </a>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-xl border border-white/10 bg-black/60 backdrop-blur-sm overflow-hidden">
                <div className="flex items-center px-4 py-3 border-b border-white/10 bg-[#0d0d0f]">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500 ml-3">
                    quick start
                  </span>
                </div>
                <div className="p-5 font-mono text-[13px] leading-7 text-zinc-200">
                  <div>
                    <span className="text-[#2496ED]">$</span> curl -fsSL{" "}
                    <span className="text-[#00E5FF]">
                      https://dokuru.rifuki.dev/install
                    </span>{" "}
                    | bash
                  </div>
                  <div className="text-zinc-500 text-[11px] mt-2">
                    # Copy URL + token, add to dashboard
                  </div>
                  <div className="text-zinc-500 text-[11px]">
                    # Run audits from app.dokuru.rifuki.dev
                    <span className="terminal-cursor" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
