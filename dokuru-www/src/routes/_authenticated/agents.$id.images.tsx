import { createFileRoute } from "@tanstack/react-router";
import { Image } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents/$id/images")({
    component: ImagesPage,
});

function ImagesPage() {
    return (
        <div className="max-w-7xl mx-auto w-full space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Images</h2>
                <p className="text-muted-foreground text-sm mt-1">Manage Docker images</p>
            </div>
            <div className="rounded-xl border border-dashed bg-card/50 p-16 text-center flex flex-col items-center justify-center min-h-[300px]">
                <Image className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-semibold">Coming Soon</h3>
                <p className="text-muted-foreground mt-2 text-sm max-w-sm">
                    Image management is under development.
                </p>
            </div>
        </div>
    );
}
