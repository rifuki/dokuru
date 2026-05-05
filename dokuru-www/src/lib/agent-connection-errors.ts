import axios from "axios";

export type AgentConnectionIssueCode =
  | "missing_token"
  | "invalid_token"
  | "access_denied"
  | "agent_unreachable"
  | "connection_timeout"
  | "cloudflare_tunnel"
  | "cloudflare_access"
  | "wrong_agent_url"
  | "docker_unavailable"
  | "agent_error"
  | "websocket_error"
  | "connection_closed"
  | "unknown";

export type AgentConnectionSeverity = "info" | "warning" | "error";

export interface AgentConnectionIssue {
  code: AgentConnectionIssueCode;
  title: string;
  message: string;
  action: string;
  retryable: boolean;
  severity: AgentConnectionSeverity;
  detail?: string;
}

type AgentConnectionContext = {
  accessMode?: string | null;
  endpoint?: "health" | "info" | "websocket";
};

const CLOUDFLARE_ORIGIN_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530]);

function issue(input: AgentConnectionIssue): AgentConnectionIssue {
  return input;
}

function responseMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  for (const key of ["message", "error", "detail", "debug"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function baseErrorDetail(error: unknown) {
  if (axios.isAxiosError(error)) {
    const parts: string[] = [];
    if (error.code) parts.push(error.code);
    if (error.message) parts.push(error.message);
    const serverMessage = responseMessage(error.response?.data);
    if (serverMessage) parts.push(serverMessage);
    return parts.join(" - ") || undefined;
  }

  return error instanceof Error ? error.message : undefined;
}

function isTimeoutError(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  return error.code === "ECONNABORTED" || error.message.toLowerCase().includes("timeout");
}

function isNetworkError(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  return !error.response || error.message.toLowerCase().includes("network error");
}

export function missingTokenIssue(): AgentConnectionIssue {
  return issue({
    code: "missing_token",
    title: "Token missing",
    message: "Dokuru does not have a token for this agent.",
    action: "Paste the current token in Edit Agent.",
    retryable: false,
    severity: "warning",
  });
}

export function classifyAgentConnectionError(error: unknown, context: AgentConnectionContext = {}): AgentConnectionIssue {
  const accessMode = context.accessMode ?? "direct";
  const isCloudflare = accessMode === "cloudflare";
  const detail = baseErrorDetail(error);

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    if (status === 401) {
      return issue({
        code: "invalid_token",
        title: "Invalid token",
        message: "Saved token was rejected.",
        action: "Update the token. Auto-retry is paused.",
        retryable: false,
        severity: "error",
        detail,
      });
    }

    if (status === 403) {
      return issue({
        code: isCloudflare ? "cloudflare_access" : "access_denied",
        title: isCloudflare ? "Cloudflare access blocked" : "Access denied",
        message: isCloudflare
          ? "Cloudflare blocked the request."
          : "The agent refused this request.",
        action: isCloudflare
          ? "Check Access, WAF, or tunnel rules."
          : "Check token permissions, then save again.",
        retryable: false,
        severity: "error",
        detail,
      });
    }

    if (status === 404) {
      return issue({
        code: "wrong_agent_url",
        title: "Wrong agent URL",
        message: "Dokuru agent API was not found.",
        action: "Check the URL or tunnel ingress.",
        retryable: false,
        severity: "error",
        detail,
      });
    }

    if (status && CLOUDFLARE_ORIGIN_STATUS.has(status)) {
      return issue({
        code: "cloudflare_tunnel",
        title: isCloudflare ? "Cloudflare tunnel unavailable" : "Origin unavailable",
        message: isCloudflare
          ? `Cloudflare returned HTTP ${status}.`
          : `Origin returned HTTP ${status}.`,
        action: isCloudflare
          ? "Check cloudflared or agent service. Retrying."
          : "Check agent service or network path. Retrying.",
        retryable: true,
        severity: "warning",
        detail,
      });
    }

    if (status && status >= 500) {
      return issue({
        code: "agent_error",
        title: "Agent internal error",
        message: `Agent returned HTTP ${status}.`,
        action: "Check agent logs or Docker health. Retrying.",
        retryable: true,
        severity: "warning",
        detail,
      });
    }

    if (isTimeoutError(error)) {
      return issue({
        code: "connection_timeout",
        title: isCloudflare ? "Cloudflare tunnel timeout" : "Agent timeout",
        message: isCloudflare
          ? "Tunnel timed out."
          : "Agent timed out.",
        action: isCloudflare
          ? "Check cloudflared or agent service. Retrying."
          : "Check service reachability. Retrying.",
        retryable: true,
        severity: "warning",
        detail,
      });
    }

    if (isNetworkError(error)) {
      return issue({
        code: isCloudflare ? "cloudflare_tunnel" : "agent_unreachable",
        title: isCloudflare ? "Cloudflare tunnel unreachable" : "Agent unreachable",
        message: isCloudflare
          ? "Tunnel did not respond."
          : "Agent URL did not respond.",
        action: isCloudflare
          ? "Check cloudflared, DNS/TLS, or agent service. Retrying."
          : "Check service, URL, firewall, DNS, or TLS. Retrying.",
        retryable: true,
        severity: "warning",
        detail,
      });
    }
  }

  return issue({
    code: "unknown",
    title: "Connection check failed",
    message: "Connection check failed.",
    action: "Check agent logs or URL, then retry.",
    retryable: true,
    severity: "warning",
    detail,
  });
}

export function dockerUnavailableIssue(message: string): AgentConnectionIssue {
  return issue({
    code: "docker_unavailable",
    title: "Docker unavailable",
    message,
    action: "Check Docker and socket access.",
    retryable: true,
    severity: "warning",
  });
}

export function classifyWebSocketClose(code: number, reason: string, accessMode?: string | null): AgentConnectionIssue {
  const isCloudflare = accessMode === "cloudflare";
  const detail = reason || `WebSocket close code ${code}`;

  if (code === 4001 || code === 1008) {
    return issue({
      code: "invalid_token",
      title: "Invalid token",
      message: "WebSocket token was rejected.",
      action: "Update the token. Auto-retry is paused.",
      retryable: false,
      severity: "error",
      detail,
    });
  }

  if (code === 4003) {
    return issue({
      code: "access_denied",
      title: "Access denied",
      message: "Agent denied the WebSocket.",
      action: "Check token permissions, then save again.",
      retryable: false,
      severity: "error",
      detail,
    });
  }

  if (code === 1001 || code === 1012) {
    return issue({
      code: "agent_unreachable",
      title: code === 1012 ? "Agent restarting" : "Agent going away",
      message: "Agent is restarting or going away.",
      action: "Waiting for service recovery. Retrying.",
      retryable: true,
      severity: "info",
      detail,
    });
  }

  if (code === 1006) {
    return issue({
      code: isCloudflare ? "cloudflare_tunnel" : "agent_unreachable",
      title: isCloudflare ? "Cloudflare WebSocket interrupted" : "WebSocket interrupted",
      message: isCloudflare
        ? "Tunnel dropped the WebSocket."
        : "WebSocket connection dropped.",
      action: isCloudflare
        ? "Check cloudflared WebSocket support. Retrying."
        : "Check network or agent service. Retrying.",
      retryable: true,
      severity: "warning",
      detail,
    });
  }

  if (code === 1000) {
    return issue({
      code: "connection_closed",
      title: "Connection closed",
      message: "Agent closed the WebSocket.",
      action: "Reconnecting for live status.",
      retryable: true,
      severity: "info",
      detail,
    });
  }

  return issue({
    code: "websocket_error",
    title: "WebSocket closed",
    message: `The agent WebSocket closed with code ${code}.`,
    action: "Dokuru will retry the connection unless the token is rejected.",
    retryable: true,
    severity: "warning",
    detail,
  });
}

export function connectionIssueSummary(issue: AgentConnectionIssue | null | undefined) {
  if (!issue) return "Unable to connect";
  return `${issue.title} - ${issue.message}`;
}
