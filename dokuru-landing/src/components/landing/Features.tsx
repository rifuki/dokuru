// @ts-nocheck
import { ShieldCheck, Wrench, History, ServerCog } from "lucide-react";

const features = [
  {
    icon: ShieldCheck,
    label: "01 / audit",
    title: "Isolation-focused security audits",
    body: "CIS-aligned checks for namespace isolation and cgroup controls, plus runtime inspection of risky Docker configurations — with structured pass/fail evidence per rule.",
    points: [
      "Namespace and cgroup coverage",
      "Runtime flag inspection",
      "Rule-level evidence",
    ],
  },
  {
    icon: Wrench,
    label: "02 / remediate",
    title: "Supported auto-remediation",
    body: "Apply one-click fixes for supported rules. For the rest, Dokuru provides guided remediation or clear manual steps — never an unsafe automatic change.",
    points: ["One-click auto-fixes", "Guided remediation", "Manual playbooks"],
  },
  {
    icon: History,
    label: "03 / history",
    title: "Audit reports and history",
    body: "Every run is stored per host: security score summary, detailed rule-level findings, and a timeline you can come back to for review and evidence.",
    points: ["Per-host score summary", "Rule-level findings", "Stored timeline"],
  },
  {
    icon: ServerCog,
    label: "04 / agent",
    title: "Agent-based host inspection",
    body: "A lightweight Rust agent installs on each Docker host and exposes a token-authenticated endpoint. Manage many hosts from a single dashboard.",
    points: [
      "Lightweight Rust agent",
      "Token-authenticated access",
      "Multi-host dashboard",
    ],
  },
];

const FeatureCard = ({ f, i }) => {
  const Icon = f.icon;
  return (
    <div
      data-testid={`feature-card-${i}`}
      className="group relative bg-[#09090B] border border-white/10 rounded-xl p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#2496ED]/40 hover:shadow-[0_30px_60px_-20px_rgba(36,150,237,0.25)]"
    >
      {/* corner ticks */}
      <span className="absolute top-0 left-0 h-3 w-3 border-t border-l border-[#2496ED]/50" />
      <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[#2496ED]/50" />

      <div className="flex items-center justify-between mb-6">
        <div className="w-11 h-11 rounded-lg bg-[#2496ED]/10 border border-[#2496ED]/20 grid place-items-center text-[#2496ED] group-hover:bg-[#2496ED]/15 transition-colors">
          <Icon size={20} strokeWidth={1.75} />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          {f.label}
        </span>
      </div>

      <h3 className="font-heading text-xl md:text-2xl font-bold text-white leading-tight">
        {f.title}
      </h3>
      <p className="mt-3 text-zinc-400 leading-relaxed text-[15px]">{f.body}</p>

      <ul className="mt-6 flex flex-wrap gap-2">
        {f.points.map((p) => (
          <li
            key={p}
            className="font-mono text-[11px] text-zinc-300 bg-white/[0.03] border border-white/10 rounded-full px-3 py-1"
          >
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
};

const Features = () => {
  return (
    <section
      id="features"
      data-testid="features-section"
      className="relative py-24 md:py-32 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="max-w-3xl mb-14">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4">
            / features
          </div>
          <h2 className="font-heading text-4xl md:text-5xl font-black tracking-tighter text-white leading-[1.05]">
            A focused toolkit for Docker
            <br />
            security posture.
          </h2>
          <p className="mt-5 text-zinc-400 text-lg max-w-2xl">
            Dokuru is built around four things and tries to do them well — no
            generic container management, no vague monitoring.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <FeatureCard key={f.title} f={f} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
