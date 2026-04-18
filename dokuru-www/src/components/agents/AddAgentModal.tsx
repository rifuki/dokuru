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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AddAgentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddAgentModal({ open, onOpenChange }: AddAgentModalProps) {
    const { createAgent, isLoading } = useAgentStore();
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [token, setToken] = useState("");
    const [accessMode, setAccessMode] = useState("cloudflare");

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
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add Docker Agent</DialogTitle>
                    <DialogDescription>
                        Connect a new Docker agent to start auditing.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g. Production Server"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isLoading}
                            autoComplete="off"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="access-mode">Access Mode</Label>
                        <Select value={accessMode} onValueChange={setAccessMode}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cloudflare">
                                    🌟 Cloudflare Tunnel (Recommended)
                                </SelectItem>
                                <SelectItem value="direct">
                                    Direct HTTP (Bring Your Own Proxy)
                                </SelectItem>
                                <SelectItem value="domain" disabled>
                                    Custom Domain (Coming Soon)
                                </SelectItem>
                                <SelectItem value="relay">
                                    🔗 Relay Mode (No Public URL Needed)
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        {accessMode === "direct" && (
                            <Alert>
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                    Make sure you've setup reverse proxy with HTTPS.
                                    <br />
                                    URL should be:{" "}
                                    <code className="text-xs">
                                        https://agent.yourdomain.com
                                    </code>
                                </AlertDescription>
                            </Alert>
                        )}

                        {accessMode === "relay" && (
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertDescription>
                                    Agent connects via WebSocket to dokuru-server.
                                    <br />
                                    No public URL needed - works behind firewall/NAT.
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    {accessMode !== "relay" && (
                        <div className="space-y-2">
                            <Label htmlFor="url">Agent URL</Label>
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
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="token">Agent Token</Label>
                        <Input
                            id="token"
                            type="password"
                            placeholder="dok_..."
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            disabled={isLoading}
                            autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                            Token from agent onboarding (shown once)
                        </p>
                    </div>

                    <DialogFooter>
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
