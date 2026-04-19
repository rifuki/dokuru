import React from "react";
import { Boxes, Gauge, Lock } from "lucide-react";

const groups = [
  {
    icon: Boxes,
    label: "group.a",
    title: "Namespace controls",
    intro: "Isolate containers from the host kernel view.",
    rules: [
      "User namespace support",
      "Host network namespace isolation",
      "Host PID namespace isolation",
      "Host IPC namespace isolation",
      "Host UTS namespace isolation",
      "Host user namespace isolation",
    ],
  },
  {
    icon: Gauge,
    label: "group.b",
    title: "Cgroup controls",
    intro: "Bound resource usage per container.",
    rules: [
      "Memory limits",
      "CPU shares / priority",
      "PIDs limit",
      "Cgroup usage confirmation",
    ],
  },
  {
    icon: Lock,
    label: "group.c",
    title: "Critical runtime isolation",
    intro: "Catch flags that silently pierce the sandbox.",
    rules: [
      "Privileged container detection",
      "Sensitive host path mounts",
      "Docker socket exposure",
      "Host device exposure",
      "Seccomp / no-new-privileges",
    ],
  },
];

const Coverage = () => {
  return (
    <section
      id="coverage"
      data-testid="coverage-section"
      className="relative py-24 md:py-32 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
          <div className="max-w-2xl">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#2496ED] mb-4">
              / coverage
            </div>
            <h2 className="font-heading text-4xl md:text-5xl font-black tracking-tighter text-white leading-[1.05]">
              Focused CIS-aligned coverage
              <br />
              for Docker isolation.
            </h2>
            <p className="mt-5 text-zinc-400 text-lg">
              Dokuru implements a selected subset of CIS Docker Benchmark
              v1.8.0 controls across sections 1–5 — with the strongest focus on
              controls that directly affect container isolation.
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 border border-white/10 rounded px-3 py-1.5 bg-white/[0.02]">
            CIS Docker Benchmark v1.8.0 · aligned, not certified
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">
          {groups.map((g, i) => {
            const Icon = g.icon;
            return (
              <div
                key={g.title}
                data-testid={`coverage-group-${i}`}
                className="bg-[#09090B] p-8 flex flex-col"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="w-10 h-10 rounded-md bg-[#2496ED]/10 border border-[#2496ED]/20 grid place-items-center text-[#2496ED]">
                    <Icon size={18} strokeWidth={1.75} />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                    {g.label}
                  </span>
                </div>
                <h3 className="font-heading text-xl md:text-2xl font-bold text-white">
                  {g.title}
                </h3>
                <p className="mt-2 text-zinc-400 text-[14px] leading-relaxed">
                  {g.intro}
                </p>

                <ul className="mt-6 flex flex-col gap-2 border-t border-white/5 pt-5">
                  {g.rules.map((r) => (
                    <li
                      key={r}
                      className="flex items-start gap-2.5 font-mono text-[13px] text-zinc-300"
                    >
                      <span className="mt-[6px] h-1 w-1 rounded-full bg-[#2496ED] shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Coverage;
