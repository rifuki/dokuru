export type AgentAccessMode = "cloudflare" | "relay" | "direct" | "domain";

export function normalizeAgentAccessMode(value: string): AgentAccessMode {
    if (value === "cloudflare" || value === "relay" || value === "direct" || value === "domain") {
        return value;
    }

    return "direct";
}
