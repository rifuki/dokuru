import type { Agent } from "@/types/agent";

const TRYCLOUDFLARE_HOST_SUFFIX = ".trycloudflare.com";

export function normalizeAgentUrlForAccessMode(rawUrl: string, accessMode?: string | null): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "relay") return trimmed;

  try {
    const url = new URL(trimmed);
    const isCloudflare =
      accessMode === "cloudflare" ||
      url.hostname === "trycloudflare.com" ||
      url.hostname.endsWith(TRYCLOUDFLARE_HOST_SUFFIX);

    if (isCloudflare && url.protocol === "http:") {
      url.protocol = "https:";
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

export function normalizeAgentEndpoint(agent: Agent): Agent {
  const url = normalizeAgentUrlForAccessMode(agent.url, agent.access_mode);
  return url === agent.url ? agent : { ...agent, url };
}
