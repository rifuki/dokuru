import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { LoadingDots } from "@/components/ui/loading-dots";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
    component: ResetPassword,
    validateSearch: (search: Record<string, unknown>) => ({
        token: search.token as string | undefined,
    }),
});

function ResetPassword() {
    const navigate = useNavigate();
    const { token } = Route.useSearch();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedPassword = password.trim();
        const trimmedConfirmPassword = confirmPassword.trim();

        setPassword(trimmedPassword);
        setConfirmPassword(trimmedConfirmPassword);

        if (trimmedPassword !== trimmedConfirmPassword) {
            toast.error("Passwords do not match");
            return;
        }

        if (trimmedPassword.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }

        if (!token) {
            toast.error("Invalid reset link");
            return;
        }

        setIsLoading(true);

        try {
            await apiClient.post("/auth/reset-password", {
                token,
                new_password: trimmedPassword,
            });
            setIsSuccess(true);
        } catch (error: unknown) {
            const message = error instanceof Error && 'response' in error 
                ? (error as { response?: { data?: { message?: string } } }).response?.data?.message 
                : undefined;
            toast.error(message || "Failed to reset password");
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <div className="w-full max-w-md space-y-6 text-center">
                    <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
                    <h1 className="text-2xl font-bold">Password Reset!</h1>
                    <p className="text-muted-foreground">
                        Your password has been reset successfully. You can now login with your new password.
                    </p>
                    <Button onClick={() => navigate({ to: "/login" })} className="mt-4">
                        Go to Login
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-[400px]">
                <div className="flex items-center justify-center gap-2 mb-10">
                    <img src="/favicon.svg" alt="Dokuru" className="w-10 h-10" />
                    <span className="text-2xl font-bold tracking-tight">Dokuru</span>
                </div>

                <div className="space-y-6">
                    <div className="text-center space-y-1">
                        <h1 className="text-2xl font-bold tracking-tight">Reset Password</h1>
                        <p className="text-sm text-muted-foreground">
                            Enter your new password below
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-sm font-medium">
                                New Password
                            </Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value.trim())}
                                    required
                                    className="h-11 pr-10 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-sm font-medium">
                                Confirm Password
                            </Label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value.trim())}
                                    required
                                    className="h-11 pr-10 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                >
                                    {showConfirmPassword ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11 bg-gradient-to-r from-miku-primary to-miku-accent hover:opacity-90 transition-opacity text-base font-medium shadow-md hover:shadow-lg"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <LoadingDots />
                            ) : (
                                "Reset Password"
                            )}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
