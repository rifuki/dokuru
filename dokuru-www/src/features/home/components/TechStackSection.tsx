import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Server,
  Database,
  Code2,
  Lock,
  Blocks,
  Layers,
  Terminal,
  Zap,
} from "lucide-react";

export function TechStackSection() {
  return (
    <section id="stack" className="py-20 px-4 sm:px-6 lg:px-8 scroll-mt-16">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Modern Tech Stack
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Built with the most reliable and developer-friendly tools
            available today.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Backend Stack */}
          <Card className="border-border hover:border-miku-primary/50 transition-all duration-300 bg-card overflow-hidden">
            <div className="h-2 w-full bg-gradient-to-r from-miku-primary to-miku-accent" />
            <CardHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 rounded-xl bg-miku-primary/10 flex items-center justify-center">
                  <Server className="w-6 h-6 text-miku-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Backend (API)</CardTitle>
                  <CardDescription className="text-base mt-1">
                    Rust & Axum Ecosystem
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 flex-shrink-0 rounded bg-muted/50">
                  <Code2 className="w-5 h-5 text-miku-primary-light" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    Rust & Axum
                  </div>
                  <div className="text-sm text-muted-foreground">
                    High performance, type-safe, concurrent web framework.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 flex-shrink-0 rounded bg-muted/50">
                  <Database className="w-5 h-5 text-miku-primary-light" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    PostgreSQL & SQLx
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Compile-time verified queries and robust migrations.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 flex-shrink-0 rounded bg-muted/50">
                  <Lock className="w-5 h-5 text-miku-primary-light" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    JWT & Argon2
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Secure authentication flow with robust password handling.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Frontend Stack */}
          <Card className="border-border hover:border-miku-secondary/50 transition-all duration-300 bg-card overflow-hidden">
            <div className="h-2 w-full bg-gradient-to-r from-miku-accent to-miku-secondary-dark" />
            <CardHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 rounded-xl bg-miku-secondary/10 flex items-center justify-center">
                  <Blocks className="w-6 h-6 text-miku-secondary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Frontend (UI)</CardTitle>
                  <CardDescription className="text-base mt-1">
                    React & TypeScript
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 flex-shrink-0 rounded bg-muted/50">
                  <Layers className="w-5 h-5 text-miku-secondary-light" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    React & Vite
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Lightning fast HMR, modern component structure.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 flex-shrink-0 rounded bg-muted/50">
                  <Terminal className="w-5 h-5 text-miku-secondary-light" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    Tailwind & shadcn/ui
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Beautifully designed, accessible, customizable components.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 p-1 flex-shrink-0 rounded bg-muted/50">
                  <Zap className="w-5 h-5 text-miku-secondary-light" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    TanStack (Router & Query)
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Type-safe routing and declarative data fetching.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
