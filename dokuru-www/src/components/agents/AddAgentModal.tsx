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
    const [url, setUrl] = useState("");
    const [token, setToken] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim() || !url.trim() || !token.trim()) {
            toast.error("All fields are required");
            return;
        }

        try {
            await createAgent({ name: name.trim(), url: url.trim(), token: token.trim() });
            toast.success("Agent added successfully");
            setName("");
            setUrl("");
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

                    <div className="space-y-2">
                        <Label htmlFor="url">Agent URL</Label>
                        <Input
                            id="url"
                            type="url"
                            placeholder="http://192.168.1.50:3939"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={isLoading}
                            autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                            The HTTP address where Dokuru Agent is running
                        </p>
                    </div>

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
