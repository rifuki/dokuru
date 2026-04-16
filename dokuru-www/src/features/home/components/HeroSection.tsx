import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ChevronRight, Github } from "lucide-react";
import { useIsAuthenticated } from "@/stores/use-auth-store";
import { TerminalBlock } from "./TerminalBlock";

export function HeroSection() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();

  const handleEnterApp = () => {
    if (isAuthenticated) {
      navigate({ to: "/" });
    } else {
      navigate({ to: "/login" });
    }
  };

  return (
    <section id="quickstart" className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-miku-primary/10 border border-miku-primary/20 mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-miku-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-miku-primary-dark"></span>
          </span>
          <span className="text-sm font-medium text-miku-primary-dark dark:text-miku-primary-light">
            Open Source Starter Template
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-6">
          Quick-start{" "}
          <span className="bg-gradient-to-r from-miku-primary via-miku-accent to-miku-secondary-dark bg-clip-text text-transparent">
            Axum
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground mb-8 leading-relaxed">
          Full-stack Rust + React template. Skip the boilerplate and ship
          faster with built-in auth, database, and UI.
        </p>

        <TerminalBlock />

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={handleEnterApp}
            className="group bg-gradient-to-r from-miku-primary to-miku-accent-dark hover:from-miku-primary-dark hover:to-miku-accent-darker text-white px-8 h-12 text-base shadow-lg shadow-miku-primary/20 transition-all hover:shadow-miku-primary/40"
          >
            Enter App
            <ChevronRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Button>
          <a
            href="https://github.com/rifuki/dokuru"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="lg" variant="outline" className="h-12 px-8">
              <Github className="mr-2 w-5 h-5" />
              Star on GitHub
            </Button>
          </a>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
          {[
            { value: "Auth", label: "Built-in JWT" },
            { value: "Safe", label: "Compile-checked SQL" },
            { value: "Rust", label: "High Performance" },
            { value: "MIT", label: "Open Source" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold text-foreground">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
