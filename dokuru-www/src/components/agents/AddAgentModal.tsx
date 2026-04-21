import { useState } from "react";
import { useAgentStore } from "@/stores/use-agent-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Cloud, Globe, Link2, Loader2, Dices } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface AddAgentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const ADJECTIVES = ["Swift", "Brave", "Mighty", "Silent", "Golden", "Azure", "Crimson", "Noble", "Rapid", "Stellar"];
const NOUNS = ["Phoenix", "Dragon", "Tiger", "Falcon", "Wolf", "Eagle", "Lion", "Panther", "Hawk", "Bear"];

function generateRandomName(): string {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${adj} ${noun}`;
}

export function AddAgentModal({ open, onOpenChange }: AddAgentModalProps) {
    const { createAgent, isLoading } = useAgentStore();
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [token, setToken] = useState("");
    const [accessMode, setAccessMode] = useState("cloudflare");

    const handleRandomName = () => {
        setName(generateRandomName());
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate required fields
        if (!name.trim() || !token.trim()) {
            toast.error("Name and token are required");
            return;
        }

        // URL required for non-relay modes
        if (accessMode !== "relay" && !url.trim()) {
            toast.error("Agent URL is required");
            return;
        }

        // Validate URL based on access mode
        if (accessMode === "cloudflare" && !url.startsWith("https://")) {
            toast.error("Cloudflare Tunnel URL must use HTTPS");
            return;
        }

        try {
            await createAgent({
                name: name.trim(),
                url: accessMode === "relay" ? "relay" : url.trim(),
                token: token.trim(),
                access_mode: accessMode,
            });
            toast.success("Agent added successfully");
            // Reset form
            setName("");
            setUrl("");
            setToken("");
            setAccessMode("cloudflare");
            onOpenChange(false);
        } catch (error) {
            toast.error((error as Error).message || "Failed to add agent");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[540px]">
                <DialogHeader>
                    <DialogTitle className="text-xl">Add Docker Agent</DialogTitle>
                    <DialogDescription>
                        Connect a new Docker agent to start managing and auditing containers.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 pt-2">
                    {/* Name Input with Random Generator */}
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-medium">Agent Name</Label>
                        <div className="flex gap-2">
                            <Input
                                id="name"
                                placeholder="e.g. Production Server"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={isLoading}
                                autoComplete="off"
                                className="flex-1"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={handleRandomName}
                                disabled={isLoading}
                                title="Generate random name"
                                className="shrink-0"
                            >
                                <Dices className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Access Mode - Radio Cards */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium">Access Mode</Label>
                        <RadioGroup value={accessMode} onValueChange={setAccessMode} className="grid gap-3">
                            <label
                                htmlFor="cloudflare"
                                className={`relative flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer transition-all ${
                                    accessMode === "cloudflare"
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                                }`}
                            >
                                <RadioGroupItem value="cloudflare" id="cloudflare" className="mt-0.5" />
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Cloud className="h-4 w-4 text-primary" />
                                        <span className="font-semibold text-sm">Cloudflare Tunnel</span>
                                        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                            Recommended
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Auto HTTPS, no domain needed. Perfect for quick setup.
                                    </p>
                                </div>
                            </label>

                            <label
                                htmlFor="direct"
                                className={`relative flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer transition-all ${
                                    accessMode === "direct"
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                                }`}
                            >
                                <RadioGroupItem value="direct" id="direct" className="mt-0.5" />
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Globe className="h-4 w-4" />
                                        <span className="font-semibold text-sm">Direct HTTP</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Use your own reverse proxy (Nginx, Caddy, Traefik).
                                    </p>
                                </div>
                            </label>

                            <label
                                htmlFor="relay"
                                className={`relative flex items-start gap-3 rounded-lg border-2 p-4 cursor-pointer transition-all ${
                                    accessMode === "relay"
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                                }`}
                            >
                                <RadioGroupItem value="relay" id="relay" className="mt-0.5" />
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Link2 className="h-4 w-4" />
                                        <span className="font-semibold text-sm">Relay Mode</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        No public URL needed. Works behind firewall/NAT.
                                    </p>
                                </div>
                            </label>
                        </RadioGroup>
                    </div>

                    {/* Agent URL - Conditional */}
                    {accessMode !== "relay" && (
                        <div className="space-y-2">
                            <Label htmlFor="url" className="text-sm font-medium">Agent URL</Label>
                            <Input
                                id="url"
                                placeholder={
                                    accessMode === "cloudflare"
                                        ? "https://xxx.trycloudflare.com"
                                        : "https://agent.yourdomain.com"
                                }
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                disabled={isLoading}
                                autoComplete="off"
                            />
                            <p className="text-xs text-muted-foreground">
                                {accessMode === "cloudflare"
                                    ? "Copy from agent setup (e.g. https://xxx.trycloudflare.com)"
                                    : "Your agent's public URL with HTTPS"}
                            </p>
                        </div>
                    )}

                    {/* Agent Token */}
                    <div className="space-y-2">
                        <Label htmlFor="token" className="text-sm font-medium">Agent Token</Label>
                        <Input
                            id="token"
                            type="password"
                            placeholder="dok_..."
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            disabled={isLoading}
                            autoComplete="off"
                            className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            Token from <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">dokuru onboard</code> (shown once only)
                        </p>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add Agent
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
