import { Zap, ShieldCheck, Package } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Docker Security Audit",
    desc: "CIS Docker Benchmark v1.8.0 compliance",
  },
  {
    icon: ShieldCheck,
    title: "Multi-tenant SaaS",
    desc: "Secure agent authentication & isolation",
  },
  {
    icon: Package,
    title: "Real-time Monitoring",
    desc: "Direct browser-to-agent communication",
  },
];

const techStack = ["Rust", "React", "TypeScript"];

export function AuthHero() {
  return (
    <div className="relative hidden lg:flex h-full flex-col bg-zinc-950 p-10 text-white dark:border-l">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <div className="relative z-20 m-auto w-full max-w-sm">
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-2xl font-medium tracking-tight">
              Dokuru Security Platform
            </h2>
            <p className="text-sm text-zinc-400">
              Multi-tenant SaaS platform for Docker security auditing based on CIS Docker Benchmark.
            </p>
          </div>

          <div className="space-y-6 pt-4">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
                  <feature.icon className="h-5 w-5 text-zinc-300" />
                </div>
                <div>
                  <h3 className="text-sm font-medium leading-none text-zinc-100">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1.5">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2.5 pt-6">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 border border-zinc-800 select-none"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
