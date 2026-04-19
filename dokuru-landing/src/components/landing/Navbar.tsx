import { useState, useEffect } from "react";
import { Moon, Sun, Menu, X, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Security Audit", href: "#security-audit" },
];

export function Navbar() {
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-background/90 backdrop-blur-md border-b border-border shadow-sm"
          : "bg-transparent"
      )}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Shield className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <span>Dokuru</span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </a>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <a
            href="https://app.dokuru.rifuki.dev"
            className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground transition-colors px-2"
          >
            Sign In
          </a>

          <Button size="sm" asChild>
            <a href="https://app.dokuru.rifuki.dev">
              Start Free Audit
            </a>
          </Button>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-md border-b border-border px-4 py-4 space-y-1">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {l.label}
            </a>
          ))}
          <div className="pt-2 border-t border-border flex gap-2">
            <a
              href="https://app.dokuru.rifuki.dev"
              className="flex-1 text-center text-sm py-2 rounded-lg border border-border hover:bg-accent transition-colors"
            >
              Sign In
            </a>
            <a
              href="https://app.dokuru.rifuki.dev"
              className="flex-1 text-center text-sm py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Start Free Audit
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
