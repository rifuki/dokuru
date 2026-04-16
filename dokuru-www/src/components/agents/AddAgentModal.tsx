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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AddAgentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddAgentModal({ open, onOpenChange }: AddAgentModalProps) {
    const { createAgent, isLoading } = useAgentStore();
    const [name, setName] = useState("");
    const [host, setHost] = useState("");
    const [port, setPort] = useState("3939");
    const [token, setToken] = useState("");

    // Auto-detect if host is IP address (show port) or domain (hide port)
    const isIpAddress = (value: string) => {
        // IPv4 regex
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        // IPv6 regex (simplified)
        const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
        return ipv4Regex.test(value) || ipv6Regex.test(value);
    };

    const showPortInput = isIpAddress(host);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim() || !host.trim() || !token.trim()) {
            toast.error("Name, host, and token are required");
            return;
        }

        // Auto-generate URL
        // IP address → http://host:port
        // Domain → http://host (assume https/cloudflare/etc)
        const url = showPortInput && port.trim()
            ? `http://${host.trim()}:${port.trim()}` 
            : `http://${host.trim()}`;

        try {
            await createAgent({ name: name.trim(), url, token: token.trim() });
            toast.success("Agent added successfully");
            setName("");
            setHost("");
            setPort("3939");
            setToken("");
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

                    <div className={showPortInput ? "grid grid-cols-3 gap-4" : "space-y-2"}>
                        <div className={`space-y-2 ${showPortInput ? "col-span-2" : ""}`}>
                            <Label htmlFor="host">Host / IP Address</Label>
                            <Input
                                id="host"
                                placeholder="192.168.1.50 or agent.example.com"
                                value={host}
                                onChange={(e) => setHost(e.target.value)}
                                disabled={isLoading}
                                autoComplete="off"
                            />
                        </div>
                        {showPortInput && (
                            <div className="space-y-2">
                                <Label htmlFor="port">Port</Label>
                                <Input
                                    id="port"
                                    type="text"
                                    placeholder="3939"
                                    value={port}
                                    onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                                    disabled={isLoading}
                                    autoComplete="off"
                                />
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                        Agent will be accessible at: {host || "host"}{showPortInput && port ? `:${port}` : ""}
                    </p>

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
