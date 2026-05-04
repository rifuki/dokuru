import type { CSSProperties, FormEvent } from "react";
import { Eye, EyeOff, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    AgentConnectionModeOption,
} from "@/components/agents/AgentConnectionModeOption";
import type { AgentAccessMode } from "@/components/agents/AgentConnectionMode";
import { IS_LOCAL_AGENT_MODE } from "@/lib/env";

const EDIT_ACCESS_MODES: AgentAccessMode[] = ["cloudflare", "relay", "direct"];
const EDIT_ACCESS_MODES_WITH_DOMAIN: AgentAccessMode[] = ["cloudflare", "relay", "direct", "domain"];

export function EditAgentModal({
    open,
    onOpenChange,
    name,
    url,
    token,
    accessMode,
    showToken,
    isSaving,
    onNameChange,
    onUrlChange,
    onTokenChange,
    onAccessModeChange,
    onShowTokenChange,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    name: string;
    url: string;
    token: string;
    accessMode: AgentAccessMode;
    showToken: boolean;
    isSaving: boolean;
    onNameChange: (value: string) => void;
    onUrlChange: (value: string) => void;
    onTokenChange: (value: string) => void;
    onAccessModeChange: (value: AgentAccessMode) => void;
    onShowTokenChange: (value: boolean) => void;
    onSave: () => void;
}) {
    const urlRequired = accessMode !== "relay";
    const canSave = !isSaving && !!name.trim() && (!urlRequired || !!url.trim());
    const modes = accessMode === "domain" ? EDIT_ACCESS_MODES_WITH_DOMAIN : EDIT_ACCESS_MODES;

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (canSave) onSave();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] gap-0 overflow-y-auto overflow-x-hidden p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[940px]">
                <DialogHeader className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
                    <DialogTitle className="text-xl">Edit Docker Agent</DialogTitle>
                    <DialogDescription>
                        Change how Dokuru reaches this host, or rotate the access token when needed.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={handleSubmit}
                    className="grid md:grid-cols-[0.82fr_1.18fr]"
                    autoComplete="off"
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                >
                    <div className="border-b border-border bg-muted/25 p-4 sm:p-5 md:border-b-0 md:border-r">
                        <div className="mb-3">
                            <div className="text-sm font-semibold">Connection mode</div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Switch between tunnel, relay, or your own reachable endpoint.
                            </p>
                        </div>

                        <div role="radiogroup" aria-label="Connection mode" className="space-y-2">
                            {modes.map((mode) => (
                                <AgentConnectionModeOption
                                    key={mode}
                                    mode={mode}
                                    checked={accessMode === mode}
                                    disabled={IS_LOCAL_AGENT_MODE && (mode === "cloudflare" || mode === "relay")}
                                    onSelect={onAccessModeChange}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col p-4 sm:p-5">
                        <div className="grid gap-3 md:grid-rows-[70px_90px_90px]">
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-agent-name" className="text-sm font-medium">Agent Name</Label>
                                <Input
                                    id="edit-agent-name"
                                    name="agent_display_name"
                                    placeholder="e.g. Production Server"
                                    value={name}
                                    onChange={(event) => onNameChange(event.target.value)}
                                    disabled={isSaving}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    data-form-type="other"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="edit-agent-url" className="text-sm font-medium">Agent URL</Label>
                                {urlRequired ? (
                                    <Input
                                        id="edit-agent-url"
                                        name="agent_endpoint_url"
                                        type="url"
                                        inputMode="url"
                                        placeholder={
                                            accessMode === "cloudflare"
                                                ? "https://xxx.trycloudflare.com"
                                                : "https://agent.yourdomain.com"
                                        }
                                        value={url}
                                        onChange={(event) => onUrlChange(event.target.value.trim())}
                                        disabled={isSaving}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                        data-form-type="other"
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                    />
                                ) : (
                                    <div className="flex h-16 items-center gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 text-sm">
                                        <Link2 className="h-4 w-4 shrink-0 text-primary" />
                                        <div className="min-w-0">
                                            <div className="font-semibold text-primary">Relay mode skips the URL field</div>
                                            <div className="mt-0.5 text-xs leading-4 text-muted-foreground">
                                                Dokuru will use the relay channel for this agent.
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {urlRequired && (
                                    <p className="text-xs leading-4 text-muted-foreground">
                                        {accessMode === "cloudflare"
                                            ? "Copy the trycloudflare URL shown by the agent."
                                            : "Use an HTTPS endpoint that reaches the agent service."}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="edit-agent-token" className="text-sm font-medium">
                                    Agent Token <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="edit-agent-token"
                                        name="dokuru_agent_secret_edit"
                                        type={showToken ? "text" : "password"}
                                        inputMode="text"
                                        placeholder="New token (optional)"
                                        value={token}
                                        onChange={(event) => onTokenChange(event.target.value.trim())}
                                        disabled={isSaving}
                                        autoComplete="one-time-code"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                        data-form-type="other"
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                        className="pr-10 font-mono text-sm"
                                        style={!showToken ? ({ WebkitTextSecurity: "disc" } as CSSProperties) : undefined}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onShowTokenChange(!showToken)}
                                        disabled={isSaving}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                                    >
                                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                <p className="text-xs leading-4 text-muted-foreground">
                                    Leave empty unless you generated a replacement token on the host.
                                </p>
                            </div>
                        </div>

                        <div className="mt-auto flex flex-col-reverse gap-3 pt-5 sm:flex-row sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isSaving}
                                className="w-full sm:w-auto"
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!canSave} className="w-full sm:w-auto">
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
