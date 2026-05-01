import type { Agent } from "@/types/agent";

export const LOCAL_AGENT_ID = "local";
export const LOCAL_AGENT_TOKEN_KEY = `agent_token_${LOCAL_AGENT_ID}`;
export const LOCAL_AGENT_NAME_KEY = "local_agent_name";

export function localAgentUrl() {
  return globalThis.location?.origin ?? "";
}

export function getLocalAgentToken() {
  try {
    return localStorage.getItem(LOCAL_AGENT_TOKEN_KEY) || localStorage.getItem("dokuru_agent_token") || "";
  } catch {
    return "";
  }
}

export function setLocalAgentToken(token: string) {
  try {
    localStorage.setItem(LOCAL_AGENT_TOKEN_KEY, token);
  } catch {
    // ignore storage failures
  }
}

export function localAgent(): Agent {
  let name = "Local Agent";
  try {
    name = localStorage.getItem(LOCAL_AGENT_NAME_KEY) || name;
  } catch {
    // ignore storage failures
  }

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
