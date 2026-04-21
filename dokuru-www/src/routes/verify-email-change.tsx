import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/verify-email-change")({
    component: VerifyEmailChange,
    validateSearch: (search: Record<string, unknown>) => ({
        token: search.token as string | undefined,
    }),
});

function VerifyEmailChange() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { token } = Route.useSearch();
    const [status, setStatus] = useState<"loading" | "success" | "error">(() => 
        !token ? "error" : "loading"
    );
    const [message, setMessage] = useState(() => 
        !token ? "Invalid verification link" : ""
    );

    useEffect(() => {
        if (!token) {
            return;
        }

        const verifyEmailChange = async () => {
            try {
                await apiClient.get(`/users/verify-email-change?token=${token}`);
                setStatus("success");
                setMessage("Email changed successfully!");
                queryClient.invalidateQueries({ queryKey: ["user"] });
                queryClient.invalidateQueries({ queryKey: ["profile"] });
            } catch (error: unknown) {
                const msg = error instanceof Error && 'response' in error 
                    ? (error as { response?: { data?: { message?: string } } }).response?.data?.message 
                    : undefined;
                setStatus("error");
                setMessage(msg || "Verification failed");
            }
        };

        verifyEmailChange();
    }, [token, queryClient]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-md space-y-6 text-center">
                {status === "loading" && (
                    <>
                        <Loader2 className="mx-auto h-16 w-16 animate-spin text-primary" />
                        <h1 className="text-2xl font-bold">Verifying your new email...</h1>
                    </>
                )}

                {status === "success" && (
                    <>
                        <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
                        <h1 className="text-2xl font-bold">Email Changed!</h1>
                        <p className="text-muted-foreground">{message}</p>
                        <Button onClick={() => navigate({ to: "/settings/profile" })} className="mt-4">
                            Go to Profile
                        </Button>
                    </>
                )}

                {status === "error" && (
                    <>
                        <XCircle className="mx-auto h-16 w-16 text-destructive" />
                        <h1 className="text-2xl font-bold">Verification Failed</h1>
                        <p className="text-muted-foreground">{message}</p>
                        <Button onClick={() => navigate({ to: "/settings/profile" })} className="mt-4">
                            Go to Profile
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
