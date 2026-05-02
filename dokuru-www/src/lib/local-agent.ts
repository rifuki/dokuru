import type { Agent } from "@/types/agent";

export const LOCAL_AGENT_ID = "local";
export const LOCAL_AGENT_TOKEN_KEY = `agent_token_${LOCAL_AGENT_ID}`;
export const LOCAL_AGENT_NAME_KEY = "local_agent_name";

type BootstrapInfo = { token: string; url: string; name: string };

let bootstrapInfo: BootstrapInfo | null = null;

export function localAgentUrl() {
  return globalThis.location?.origin ?? "";
}

export function getLocalAgentToken() {
  return bootstrapInfo?.token ?? "";
}

export function setLocalAgentToken(token: string) {
  bootstrapInfo = { ...(bootstrapInfo ?? { url: localAgentUrl(), name: "Local Agent" }), token };
}

export function setLocalAgentBootstrap(info: BootstrapInfo) {
  bootstrapInfo = info;
}

export async function fetchBootstrapInfo(): Promise<BootstrapInfo | null> {
  try {
    const response = await fetch(`${localAgentUrl()}/api/v1/bootstrap`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.data;
  } catch {
    return null;
  }
}

export function localAgent(): Agent {
  const name = bootstrapInfo?.name || "Local Agent";

  const now = new Date().toISOString();
  return {
    id: LOCAL_AGENT_ID,
    name,
    url: localAgentUrl(),
    access_mode: "direct",
    status: "local",
    last_seen: now,
    created_at: now,
    updated_at: now,
    token: getLocalAgentToken() || undefined,
  };
}
