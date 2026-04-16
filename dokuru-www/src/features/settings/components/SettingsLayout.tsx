import { Outlet, Link, useLocation } from "@tanstack/react-router";
import { User, Shield, MonitorSmartphone } from "lucide-react";

const settingsNavigation = [
    { name: "Profile", href: "/settings/profile", icon: User },
    { name: "Security", href: "/settings/security", icon: Shield },
    { name: "Sessions", href: "/settings/sessions", icon: MonitorSmartphone },
];

export function SettingsLayout() {
    const location = useLocation();

    return (
        <div className="max-w-5xl mx-auto w-full space-y-6">
            {/* Header */}
            <div className="border-b pb-6">
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your account settings and preferences
                </p>
            </div>

            {/* Tabs Navigation */}
            <div className="border-b">
                <nav className="flex gap-6 -mb-px">
                    {settingsNavigation.map((item) => {
                        const isActive = location.pathname === item.href;
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                className={`
                                    flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors
                                    ${isActive
                                        ? "border-miku-primary text-miku-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                                    }
                                `}
                            >
                                <Icon className="h-4 w-4" />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Content */}
            <div className="pb-8">
                <Outlet />
            </div>
        </div>
    );
}
