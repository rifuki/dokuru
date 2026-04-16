import { Link } from "@tanstack/react-router";

interface ActionCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

export function ActionCard({ title, description, href, icon, comingSoon }: ActionCardProps) {
  return (
    <Link
      to={href}
      className="group flex items-start gap-4 rounded-lg border p-4 hover:bg-accent hover:text-accent-foreground transition-colors relative"
    >
      <div className="rounded-md bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">{title}</h4>
          {comingSoon && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              Soon
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
