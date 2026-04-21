import { Cpu, KeyRound, Archive, Zap, Container, Code } from "lucide-react";
import { motion } from "framer-motion";
import ScrollReveal from "./ScrollReveal";

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
  {
    icon: Code,
    title: "Open source and transparent",
    body: "Full source code available. Review the audit logic, contribute improvements, and run it anywhere.",
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
          <ScrollReveal className="lg:col-span-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4">
              / why dokuru
            </div>
            <h2 className="font-heading text-4xl md:text-5xl font-black tracking-tighter text-white leading-[1.05]">
              Built for practical
              <br className="hidden sm:block" />
              Docker security
              <br className="hidden sm:block" />
              workflows.
            </h2>
            <p className="mt-5 text-zinc-400 text-lg">
              Opinionated on scope, honest about coverage, and designed to live
              inside the audit-fix-review loop your team actually runs.
            </p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 p-5 rounded-xl border border-white/10 bg-white/[0.02]"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-2">
                honest scope
              </div>
              <p className="text-zinc-300 text-[14px] leading-relaxed">
                Dokuru is not a full CIS compliance platform, container
                orchestrator, or infrastructure monitor. It is a Docker
                security audit tool with a clear focus.
              </p>
            </motion.div>
          </ScrollReveal>

          <div className="lg:col-span-8">
            <ul className="grid sm:grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
              {points.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.li
                    key={p.title}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.4, delay: i * 0.1 }}
                    whileHover={{ scale: 1.05, backgroundColor: "#0c0c0f" }}
                    data-testid={`trust-point-${i}`}
                    className="bg-[#09090B] p-7 flex flex-col gap-3 transition-colors"
                  >
                    <motion.div whileHover={{ rotate: 360 }} transition={{ duration: 0.6 }}>
                      <Icon
                        size={20}
                        strokeWidth={1.75}
                        className="text-[#2496ED]"
                      />
                    </motion.div>
                    <h3 className="font-heading text-lg font-bold text-white">
                      {p.title}
                    </h3>
                    <p className="text-zinc-400 text-[14px] leading-relaxed">
                      {p.body}
                    </p>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyDokuru;
