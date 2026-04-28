import { useState } from "react";
import type { ReactNode } from "react";
import { Check, Cloud, Copy, KeyRound, Link2, Terminal, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const AGENT_INSTALL_COMMAND = "curl -fsSL https://dokuru.rifuki.dev/install | bash";

type AgentSetupGuideProps = {
    className?: string;
};

type AgentSetupDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onStartAddAgent?: () => void;
};

export function AgentSetupGuide({ className = "" }: AgentSetupGuideProps) {
    return (
        <div className={`rounded-xl border border-primary/20 bg-primary/5 p-4 ${className}`}>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr] lg:items-center">
                <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                        <Terminal className="h-4 w-4" />
                    </span>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground">Install agent on the Docker host</div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            The agent prints the URL and token you paste into Dokuru.
                            </p>
                        </div>
                </div>

                <AgentInstallCommand />
            </div>
        </div>
    );
}

export function AgentSetupDialog({ open, onOpenChange, onStartAddAgent }: AgentSetupDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                    <DialogTitle>Install Docker Agent</DialogTitle>
                    <DialogDescription>
                        Run the installer on the Docker host, then paste the generated values into Add Agent.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <AgentSetupGuide />

                    <div className="grid gap-3 md:grid-cols-3">
                        <SetupStep
                            icon={<Workflow className="h-4 w-4" />}
                            title="1. Run setup"
                            description="Installs dokuru, sets up the service, and prepares the host."
                        />
                        <SetupStep
                            icon={<Cloud className="h-4 w-4" />}
                            title="2. Choose access"
                            description="Use Cloudflare Tunnel for easiest HTTPS, or Relay for no public URL."
                        />
                        <SetupStep
                            icon={<KeyRound className="h-4 w-4" />}
                            title="3. Copy output"
                            description="Paste Agent URL and Agent Token into the Add Agent form."
                        />
                    </div>

                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                        Token is shown once on the host. If you lose it, rotate or regenerate the token from the agent CLI.
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    {onStartAddAgent && (
                        <Button onClick={onStartAddAgent}>
                            Open Add Agent
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AgentInstallCommand() {
    const [copied, setCopied] = useState(false);

    const copyCommand = async () => {
        try {
            await navigator.clipboard.writeText(AGENT_INSTALL_COMMAND);
            setCopied(true);
            toast.success("Install command copied");
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error("Failed to copy install command");
        }
    };

    return (
        <div className="group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-black/50 p-2 pl-3 font-mono text-sm shadow-inner">
            <span className="select-none text-primary">$</span>
            <div className="min-w-0 flex-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
                <code className="block w-max whitespace-nowrap pr-2 text-foreground/90">
                    {AGENT_INSTALL_COMMAND}
                </code>
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyCommand()}
                className="shrink-0 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
            >
                {copied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
            </Button>
        </div>
    );
}

function SetupStep({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
    return (
        <div className="rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {icon}
                </span>
                {title}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
    );
}

export function RelayHint() {
    return (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2 font-semibold text-primary">
                <Link2 className="h-3.5 w-3.5" />
                Relay mode skips the URL field
            </div>
            Use Relay on the agent host, then paste the generated token below.
        </div>
    );
}
