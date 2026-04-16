import { Outlet } from "@tanstack/react-router";

export function SettingsLayout() {
    return (
        <div className="max-w-4xl mx-auto w-full space-y-6">
            {/* Header */}
            <div className="border-b pb-6">
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground mt-2">
                    Manage your account settings and preferences
                </p>
            </div>

            {/* Content */}
            <div className="pb-8">
                <Outlet />
            </div>
        </div>
    );
}
