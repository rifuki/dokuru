import { Cpu, KeyRound, Archive, Zap, Container } from "lucide-react";

const points = [
  {
    icon: Cpu,
    title: "Rust-based agent and backend",
    body: "Low overhead, predictable performance, and a tight surface area on every Docker host.",
  },
  {
    icon: KeyRound,
    title: "Token-authenticated host access",
    body: "Each host exposes a scoped, token-authenticated endpoint — no broad infrastructure access required.",
  },
  {
    icon: Archive,
    title: "Stored audit history",
    body: "Every run is kept per host, so you can compare runs, build evidence, and show progress over time.",
  },
  {
    icon: Zap,
    title: "Auto-fix for selected rules",
    body: "Safe, reviewable auto-remediation where it makes sense — guided or manual paths where it doesn't.",
  },
  {
    icon: Container,
    title: "Docker-focused inspection model",
    body: "Not a generic server scanner. Dokuru understands Docker containers, namespaces, and cgroups.",
  },
];

const WhyDokuru = () => {
  return (
    <section
      id="why-dokuru"
      data-testid="why-dokuru-section"
      className="relative py-24 md:py-32 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4">
              / why dokuru
            </div>
            <h2 className="font-heading text-4xl md:text-5xl font-black tracking-tighter text-white leading-[1.05]">
              Built for practical
              <br />
              Docker security
              <br />
              workflows.
            </h2>
            <p className="mt-5 text-zinc-400 text-lg">
              Opinionated on scope, honest about coverage, and designed to live
              inside the audit-fix-review loop your team actually runs.
            </p>

            <div className="mt-8 p-5 rounded-xl border border-white/10 bg-white/[0.02]">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-2">
                honest scope
              </div>
              <p className="text-zinc-300 text-[14px] leading-relaxed">
                Dokuru is not a full CIS compliance platform, container
                orchestrator, or infrastructure monitor. It is a Docker
                security audit tool with a clear focus.
              </p>
            </div>
          </div>

          <div className="lg:col-span-8">
            <ul className="grid sm:grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
              {points.map((p, i) => {
                const Icon = p.icon;
                return (
                  <li
                    key={p.title}
                    data-testid={`trust-point-${i}`}
                    className="bg-[#09090B] p-7 flex flex-col gap-3 hover:bg-[#0c0c0f] transition-colors"
                  >
                    <Icon
                      size={20}
                      strokeWidth={1.75}
                      className="text-[#2496ED]"
                    />
                    <h3 className="font-heading text-lg font-bold text-white">
                      {p.title}
                    </h3>
                    <p className="text-zinc-400 text-[14px] leading-relaxed">
                      {p.body}
                    </p>
                  </li>
                );
              })}
              <li className="bg-[#09090B] p-7 flex flex-col justify-center items-start gap-2 sm:col-span-2 md:col-span-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                  / stack
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {["Rust", "React", "Docker"].map(
                    (t) => (
                      <span
                        key={t}
                        className="font-mono text-[11px] text-zinc-200 bg-white/[0.03] border border-white/10 rounded px-2 py-1"
                      >
                        {t}
                      </span>
                    )
                  )}
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyDokuru;
