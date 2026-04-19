import { Shield } from "lucide-react";

const LINKS = {
  Product: [
    { label: "Dashboard", href: "https://app.dokuru.rifuki.dev" },
    { label: "Install Agent", href: "https://dokuru.rifuki.dev/install" },
    { label: "GitHub", href: "https://github.com/rifuki/dokuru" },
  ],
  Docs: [
    { label: "How It Works", href: "#how-it-works" },
    { label: "Security Audit", href: "#security-audit" },
    { label: "CIS Benchmark", href: "https://www.cisecurity.org/benchmark/docker" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold text-base">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary-foreground" />
              </div>
              Dokuru
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Self-hosted Docker security monitoring and CIS Benchmark auditing.
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground border border-border rounded-full px-2.5 py-1">
              Built with Rust &amp; React
            </span>
          </div>

          {/* Links */}
          {Object.entries(LINKS).map(([group, links]) => (
            <div key={group}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {group}
              </h4>
              <ul className="space-y-2">
                {links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      {...(l.href.startsWith("http")
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Dokuru. MIT Licensed.</span>
          <span className="font-mono">dokuru.rifuki.dev</span>
        </div>
      </div>
    </footer>
  );
}
