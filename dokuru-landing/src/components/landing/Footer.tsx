import { Github } from "lucide-react";
import { motion } from "framer-motion";
import DokuruMark from "./DokuruMark";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Audit Coverage", href: "#coverage" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "Dashboard", href: "#cta" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "GitHub", href: "#github" },
      { label: "Documentation", href: "#docs" },
      { label: "API", href: "#api" },
      { label: "Changelog", href: "#changelog" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "About", href: "#about" },
      { label: "Contact", href: "#contact" },
      { label: "Research Context", href: "#research" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "#privacy" },
      { label: "Terms", href: "#terms" },
    ],
  },
];

const Footer = () => {
  return (
    <footer
      data-testid="site-footer"
      className="relative border-t border-white/10 pt-20 pb-10"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="grid lg:grid-cols-12 gap-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-4"
          >
            <div className="flex items-center gap-2.5">
              <DokuruMark className="h-7 w-7" />
              <span className="font-heading font-black text-white text-lg tracking-tight">
                dokuru
              </span>
            </div>
            <p className="mt-4 text-zinc-400 text-[14px] leading-relaxed max-w-sm">
              Agent-based Docker security auditing. CIS-aligned checks focused
              on namespace isolation, cgroup controls, and runtime hardening.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <motion.a
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
                href="#github"
                data-testid="footer-social-github"
                className="w-9 h-9 rounded-md border border-white/10 hover:border-white/30 grid place-items-center text-zinc-400 hover:text-white transition-colors"
                aria-label="GitHub"
              >
                <Github size={16} />
              </motion.a>
            </div>
          </motion.div>

          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-8">
            {columns.map((col, i) => (
              <motion.div
                key={col.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-4">
                  {col.title}
                </div>
                <ul className="flex flex-col gap-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <motion.a
                        whileHover={{ x: 5 }}
                        href={l.href}
                        data-testid={`footer-link-${l.label
                          .toLowerCase()
                          .replace(/\s+/g, "-")}`}
                        className="text-[14px] text-zinc-300 hover:text-white transition-colors inline-block"
                      >
                        {l.label}
                      </motion.a>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 pt-6 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div className="font-mono text-[11px] text-zinc-500">
            © 2026 Dokuru. All rights reserved.
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">
            dokuru / agent · dashboard
          </div>
        </motion.div>
      </div>
    </footer>
  );
};

export default Footer;
