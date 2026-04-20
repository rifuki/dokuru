import { AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import ScrollReveal from "./ScrollReveal";

const pains = [
  {
    num: "01",
    title: "Manual review doesn't scale.",
    body: "Inspecting namespaces, cgroup limits, and runtime flags by hand across every Docker host is slow, error-prone, and hard to repeat.",
  },
  {
    num: "02",
    title: "Isolation quietly breaks.",
    body: "Misconfigured user, network, PID, or IPC namespaces — and missing cgroup limits — weaken the boundaries that keep containers contained.",
  },
  {
    num: "03",
    title: "Runtime flags bypass your threat model.",
    body: "Privileged mode, sensitive host-path mounts, and an exposed Docker socket silently hand containers the keys to the host.",
  },
  {
    num: "04",
    title: "Findings without evidence don't ship.",
    body: "Teams need rule-level results, evidence, and a remediation path — not another dashboard of vague severity counts.",
  },
];

const Problem = () => {
  return (
    <section
      id="problem"
      data-testid="problem-section"
      className="relative py-24 md:py-32 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="grid lg:grid-cols-12 gap-10">
          <ScrollReveal className="lg:col-span-5">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-5">
              <AlertTriangle size={12} />
              <span>/ the problem</span>
            </div>
            <h2 className="font-heading text-4xl md:text-5xl font-black tracking-tighter leading-[1.05] text-white">
              Docker misconfigurations
              <br />
              are <span className="text-rose-400">easy to miss</span> —
              <br />
              and expensive to find
              <br />
              the hard way.
            </h2>
            <p className="mt-6 text-zinc-400 leading-relaxed max-w-md">
              Container isolation isn't a single switch. It's a stack of
              namespaces, cgroup constraints, and runtime flags that have to
              agree with each other on every host.
            </p>
          </ScrollReveal>

          <div className="lg:col-span-7 lg:pl-6">
            <ul className="divide-y divide-white/5 border-y border-white/5">
              {pains.map((p, i) => (
                <motion.li
                  key={p.num}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  whileHover={{ x: 10 }}
                  data-testid={`problem-item-${p.num}`}
                  className="py-6 md:py-7 grid grid-cols-[auto_1fr] gap-5 md:gap-8 group"
                >
                  <span className="font-mono text-xs text-zinc-600 group-hover:text-[#2496ED] transition-colors pt-1">
                    {p.num}
                  </span>
                  <div>
                    <h3 className="font-heading text-lg md:text-xl font-bold text-white">
                      {p.title}
                    </h3>
                    <p className="mt-2 text-zinc-400 leading-relaxed text-[15px]">
                      {p.body}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Problem;
