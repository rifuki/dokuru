import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
    component: ForgotPassword,
});

function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            await apiClient.post("/auth/forgot-password", { email });
            setIsSuccess(true);
        } catch (error: unknown) {
            const message = error instanceof Error && 'response' in error 
                ? (error as { response?: { data?: { message?: string } } }).response?.data?.message 
                : undefined;
            toast.error(message || "Failed to send reset email");
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <div className="w-full max-w-md space-y-6 text-center">
                    <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
                    <h1 className="text-2xl font-bold">Check your email</h1>
                    <p className="text-muted-foreground">
                        If an account exists for {email}, you will receive a password reset link shortly.
                    </p>
                    <Link to="/login">
                        <Button className="mt-4">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Login
                        </Button>
                    </Link>
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
                        <h1 className="text-2xl font-bold tracking-tight">Forgot Password?</h1>
                        <p className="text-sm text-muted-foreground">
                            Enter your email and we'll send you a reset link
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-sm font-medium">
                                Email Address
                            </Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="email@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="h-11 pl-10 transition-all focus-visible:ring-2 focus-visible:ring-miku-primary/50"
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11 bg-gradient-to-r from-miku-primary to-miku-accent hover:opacity-90 transition-opacity text-base font-medium shadow-md hover:shadow-lg"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                "Send Reset Link"
                            )}
                        </Button>
                    </form>

                    <Link to="/login">
                        <Button variant="ghost" className="w-full">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Login
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
