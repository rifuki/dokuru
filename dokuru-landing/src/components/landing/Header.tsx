import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import DokuruMark from "./DokuruMark";

const NAV = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Coverage", href: "#coverage" },
  { label: "Why Dokuru", href: "#why-dokuru" },
];

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-testid="site-header"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#050505]/80 backdrop-blur-xl border-b border-white/10"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
        <a
          href="#top"
          data-testid="header-logo"
          className="flex items-center gap-2.5 group"
        >
          <DokuruMark className="h-7 w-7" />
          <span className="font-heading font-black text-white text-lg tracking-tight">
            dokuru
          </span>
          <span className="hidden sm:inline-block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500 border border-white/10 rounded px-1.5 py-0.5 ml-1">
            v1
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              data-testid={`nav-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="https://app.dokuru.rifuki.dev"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="header-cta-enter-app"
            className="inline-flex items-center gap-2 bg-[#2496ED] hover:bg-[#1C7CBA] text-white text-sm font-medium px-4 py-2 rounded-md shadow-[0_0_24px_-4px_rgba(36,150,237,0.5)] transition-all"
          >
            Enter App
          </a>
          <button
            data-testid="header-mobile-toggle"
            onClick={() => setOpen((o) => !o)}
            className="md:hidden text-zinc-400 hover:text-white"
            aria-label="Toggle menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          data-testid="mobile-nav"
          className="md:hidden border-t border-white/10 bg-[#050505]/95 backdrop-blur-xl"
        >
          <div className="px-6 py-4 flex flex-col gap-4">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-sm text-zinc-300 hover:text-white"
                data-testid={`mobile-nav-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
