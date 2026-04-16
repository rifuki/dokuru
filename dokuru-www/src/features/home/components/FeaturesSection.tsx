import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Shield,
  Lock,
  Database,
  Zap,
  Server,
  Code2,
} from "lucide-react";

export function FeaturesSection() {
  const features = [
    {
      icon: Shield,
      title: "JWT Authentication",
      description:
        "Access + refresh tokens with httpOnly cookies. Automatic token rotation included.",
    },
    {
      icon: Lock,
      title: "Argon2 Password Hashing",
      description:
        "Industry-leading password hashing. Secure by default, no configuration needed.",
    },
    {
      icon: Database,
      title: "PostgreSQL + SQLx",
      description:
        "Type-safe database queries with compile-time checked SQL migrations included.",
    },
    {
      icon: Zap,
      title: "Rate Limiting",
      description:
        "Built-in protection against brute force attacks. Configurable per IP out of the box.",
    },
    {
      icon: Server,
      title: "Request Tracing",
      description:
        "Structured logging with request IDs. Performance metrics and HTTP tracing ready.",
    },
    {
      icon: Code2,
      title: "API Key Support",
      description:
        "Machine-to-machine authentication with optional API key middleware.",
    },
  ];

  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Batteries Included
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to build production-ready Rust APIs. No more
            boilerplate.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group border-border hover:border-miku-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-miku-primary/10 bg-card"
            >
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-miku-primary/10 to-miku-accent/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-miku-primary-dark dark:text-miku-primary-light" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
