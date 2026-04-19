import { Users, ShieldAlert, GraduationCap, ArrowRight } from "lucide-react";

const cases = [
  {
    icon: Users,
    tag: "devops",
    title: "DevOps & platform teams",
    body: "Standardize Docker host security checks across environments. Audit on every rollout, track drift, and apply supported fixes without leaving the dashboard.",
    bullets: [
      "Multi-host audits",
      "Drift visibility",
      "Repeatable workflow",
    ],
  },
  {
    icon: ShieldAlert,
    tag: "security",
    title: "Security teams",
    body: "Inspect isolation posture, review risky runtime settings, and collect rule-level evidence for remediation — without building a custom scanner.",
    bullets: [
      "Evidence per rule",
      "Remediation states",
      "Audit history",
    ],
  },
  {
    icon: GraduationCap,
    tag: "research",
    title: "Academic & research demos",
    body: "Show, in a real Docker environment, how namespace and cgroup configuration change container isolation — with reproducible audit output.",
    bullets: [
      "Reproducible runs",
      "Rule-by-rule detail",
      "Thesis-ready output",
    ],
  },
];

const UseCases = () => {
  return (
    <section
      id="use-cases"
      data-testid="use-cases-section"
      className="relative py-24 md:py-32 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="mb-14 max-w-3xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4">
            / use cases
          </div>
          <h2 className="font-heading text-4xl md:text-5xl font-black tracking-tighter text-white leading-[1.05]">
            Who runs Dokuru.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {cases.map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                data-testid={`use-case-${i}`}
                className="relative group rounded-xl border border-white/10 bg-[#09090B] p-7 overflow-hidden hover:border-[#2496ED]/40 transition-colors"
              >
                <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-[#2496ED]/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-10 h-10 rounded-md bg-[#2496ED]/10 border border-[#2496ED]/20 grid place-items-center text-[#2496ED]">
                      <Icon size={18} strokeWidth={1.75} />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                      /{c.tag}
                    </span>
                  </div>
                  <h3 className="font-heading text-xl font-bold text-white">
                    {c.title}
                  </h3>
                  <p className="mt-3 text-zinc-400 text-[14px] leading-relaxed">
                    {c.body}
                  </p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {c.bullets.map((b) => (
                      <li
                        key={b}
                        className="font-mono text-[11px] text-zinc-300 bg-white/[0.03] border border-white/10 rounded-full px-2.5 py-1"
                      >
                        {b}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="#cta"
                    data-testid={`use-case-cta-${i}`}
                    className="mt-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#2496ED] hover:text-white transition-colors"
                  >
                    start auditing
                    <ArrowRight size={12} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default UseCases;
