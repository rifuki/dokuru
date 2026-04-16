import { ThemeToggle } from "@/components/ThemeToggle";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 relative">
          <div className="flex items-center gap-2 z-10">
            <img src="/favicon.svg" alt="Logo" className="w-8 h-8" />
            <span className="text-xl font-bold text-foreground">Dokuru</span>
          </div>

          {/* Centered nav links */}
          <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none">
            <div className="flex items-center gap-8 pointer-events-auto">
              <a
                href="#quickstart"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Quick Start
              </a>
              <a
                href="#stack"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Tech Stack
              </a>
              <a
                href="#features"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2 z-10">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
