// @ts-nocheck
import { Copy, Check } from "lucide-react";

const steps = [
  {
    num: "01",
    title: "Install the agent",
    body: "Drop the Rust agent onto any Docker host. It produces a host URL and an access token you use to onboard it.",
  },
  {
    num: "02",
    title: "Connect the host",
    body: "Paste the host URL and token into your Dokuru dashboard. The host is registered and ready to audit.",
  },
  {
    num: "03",
    title: "Audit and fix",
    body: "Run a security audit, review rule-by-rule findings with evidence, save the report, and apply supported fixes.",
  },
];

const TerminalLine = ({ prompt = "$", children, comment }) => (
  <div className="flex items-start gap-3">
    <span className="text-[#2496ED] select-none">{prompt}</span>
    <div className="flex-1">
      <span className="text-zinc-100">{children}</span>
      {comment && (
        <div className="text-zinc-600 text-[12px] mt-1">{comment}</div>
      )}
    </div>
  </div>
);

const HowItWorks = () => {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(
      "curl -fsSL https://get.dokuru.dev | sh\ndokuru onboard"
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
                className="grid grid-cols-[auto_1fr] gap-5"
              >
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-md border border-white/15 bg-[#09090B] grid place-items-center font-mono text-sm text-[#2496ED]">
                    {s.num}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 bg-gradient-to-b from-[#2496ED]/40 to-transparent mt-2" />
                  )}
                </div>
                <div className="pb-4">
                  <h3 className="font-heading text-xl md:text-2xl font-bold text-white">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-zinc-400 text-[15px] leading-relaxed max-w-md">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* Terminal block */}
          <div className="lg:col-span-7">
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
                  data-testid="terminal-copy-btn"
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

              <div className="p-6 font-mono text-[13px] leading-7 space-y-4">
                <TerminalLine comment="# install the Dokuru agent">
                  curl -fsSL{" "}
                  <span className="text-[#00E5FF]">
                    https://get.dokuru.dev
                  </span>{" "}
                  | sh
                </TerminalLine>
                <TerminalLine comment="# generate host URL + access token">
                  dokuru <span className="text-emerald-300">onboard</span>
                </TerminalLine>
                <TerminalLine comment="# run a CIS-aligned audit from the dashboard or CLI">
                  dokuru <span className="text-emerald-300">audit</span>{" "}
                  <span className="text-zinc-400">--policy</span>{" "}
                  <span className="text-amber-300">cis-docker</span>
                  <span className="terminal-cursor" />
                </TerminalLine>

                {/* mock output */}
                <div className="mt-4 border-t border-white/5 pt-4 text-[12px] space-y-1 text-zinc-400">
                  <div>
                    <span className="text-zinc-600">→</span> agent{" "}
                    <span className="text-emerald-400">ok</span>{" "}
                    <span className="text-zinc-600">·</span> token verified
                  </div>
                  <div>
                    <span className="text-zinc-600">→</span> inspecting{" "}
                    <span className="text-zinc-200">42</span> rules{" "}
                    <span className="text-zinc-600">·</span> sections 1–5
                  </div>
                  <div>
                    <span className="text-zinc-600">→</span> result:{" "}
                    <span className="text-rose-400">7 failed</span>,{" "}
                    <span className="text-amber-400">3 warn</span>,{" "}
                    <span className="text-emerald-400">32 passed</span>
                  </div>
                  <div>
                    <span className="text-zinc-600">→</span> report saved ·{" "}
                    <span className="text-[#2496ED]">
                      dokuru.dev/audits/2f9a…
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600 flex justify-between">
              <span>// onboarding — under 60 seconds</span>
              <span>linux · x86_64 / arm64</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
