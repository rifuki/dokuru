// @ts-nocheck
import { ArrowRight, Terminal } from "lucide-react";
import { motion } from "framer-motion";
import AuditPanel from "./AuditPanel";

const Support = ({ children, delay = 0 }) => (
  <motion.li
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.5, delay }}
    className="flex items-start gap-3"
  >
    <span className="mt-1.5 h-1.5 w-1.5 rounded-sm bg-[#2496ED] shrink-0" />
    <span className="text-zinc-300 text-[15px] leading-relaxed">{children}</span>
  </motion.li>
);

const Hero = () => {
  return (
    <section
      id="top"
      data-testid="hero-section"
      className="relative pt-20 md:pt-24 pb-20 md:pb-28 overflow-hidden"
    >
      {/* background grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="absolute inset-0 bg-grid-fine mask-fade-b pointer-events-none"
      />
      {/* radial accent */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[#2496ED]/10 blur-[140px] pointer-events-none"
      />

      <div className="relative max-w-7xl mx-auto px-6 md:px-10">
        {/* status row */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex items-center gap-3 mb-8"
        >
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400 border border-white/10 rounded-full px-3 py-1.5 bg-white/[0.02]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            CIS Docker Benchmark v1.8.0 aligned
          </span>
          <span className="hidden sm:inline font-mono text-[11px] text-zinc-600">
            // agent-based · namespace · cgroup · runtime
          </span>
        </motion.div>

        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* Left */}
          <div className="lg:col-span-7">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              data-testid="hero-headline"
              className="font-heading text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-[0.95] text-white"
            >
              Monitor Docker
              <br />
              security across
              <br />
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-white via-white to-[#2496ED] bg-clip-text text-transparent">
                  your infrastructure.
                </span>
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: 1 }}
                  className="absolute -bottom-2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#2496ED]/50 to-transparent origin-left"
                />
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              data-testid="hero-subheadline"
              className="mt-7 text-lg md:text-xl text-zinc-400 leading-relaxed max-w-2xl"
            >
              Dokuru audits Docker hosts using CIS-aligned checks focused on{" "}
              <span className="text-zinc-200">namespace isolation</span>,{" "}
              <span className="text-zinc-200">cgroup controls</span>, and{" "}
              <span className="text-zinc-200">critical runtime hardening</span>.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="https://app.dokuru.rifuki.dev"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="hero-cta-primary"
                className="group inline-flex items-center gap-2 bg-[#2496ED] hover:bg-[#1C7CBA] text-white font-medium px-5 py-3 rounded-md shadow-[0_0_40px_-6px_rgba(36,150,237,0.7)] transition-all"
              >
                Enter App
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                href="#how-it-works"
                data-testid="hero-cta-secondary"
                className="inline-flex items-center gap-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/25 text-white font-medium px-5 py-3 rounded-md transition-all"
              >
                <Terminal size={16} className="text-[#2496ED]" />
                See How It Works
              </motion.a>
            </motion.div>

            {/* Support bullets */}
            <ul className="mt-10 grid sm:grid-cols-1 gap-3 max-w-xl">
              <Support delay={0.9}>Agent-based Docker host inspection</Support>
              <Support delay={1.0}>Namespace and cgroup-focused security checks</Support>
              <Support delay={1.1}>One-click fixes for supported misconfigurations</Support>
            </ul>
          </div>

          {/* Right — audit panel */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="lg:col-span-5 lg:pl-4 relative"
          >
            <div className="relative">
              <div className="absolute -inset-px rounded-xl bg-gradient-to-br from-[#2496ED]/40 via-transparent to-[#00E5FF]/30 blur-[2px] opacity-70 pointer-events-none" />
              <div className="relative">
                <AuditPanel />
              </div>
            </div>

            {/* meta labels */}
            <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              <span>// fig.01 — audit summary</span>
              <span>dokuru/dashboard</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
