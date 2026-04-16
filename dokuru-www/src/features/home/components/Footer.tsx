import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="./favicon.svg" alt="Dokuru Logo" className="w-6 h-6" />
            <span className="text-xl font-bold text-foreground">Dokuru</span>
          </div>
          <p className="text-sm text-muted-foreground">
            MIT License © 2026. Docker Security Audit Platform.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/rifuki/dokuru"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
