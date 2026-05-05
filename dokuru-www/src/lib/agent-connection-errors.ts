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
    action: "Edit the agent and paste the current token from the host.",
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
        message: "The agent rejected the saved token.",
        action: "Edit this agent and paste the latest token. Auto-reconnect is paused until the token changes.",
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
          ? "Cloudflare blocked the request before it reached the Dokuru agent."
          : "The agent refused this request with HTTP 403.",
        action: isCloudflare
          ? "Check Cloudflare Access, WAF, tunnel ingress rules, or bypass protection for the agent URL."
          : "Check the token and agent permissions, then save the agent again.",
        retryable: false,
        severity: "error",
        detail,
      });
    }

    if (status === 404) {
      return issue({
        code: "wrong_agent_url",
        title: "Wrong agent URL",
        message: "The URL responded, but the Dokuru agent API endpoint was not found.",
        action: "Check the agent URL, tunnel hostname, and make sure it points to the Dokuru agent service.",
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
          ? `Cloudflare returned HTTP ${status}, usually because the tunnel or origin service is down.`
          : `The agent origin returned HTTP ${status}.`,
        action: isCloudflare
          ? "Check cloudflared, tunnel ingress, and whether the Dokuru agent is running on the host. Dokuru will keep retrying."
          : "Check the agent service and network path. Dokuru will keep retrying.",
        retryable: true,
        severity: "warning",
        detail,
      });
    }

    if (status && status >= 500) {
      return issue({
        code: "agent_error",
        title: "Agent internal error",
        message: `The agent responded with HTTP ${status}.`,
        action: "Check the agent logs and Docker daemon health. Dokuru will retry.",
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
          ? "The Cloudflare tunnel did not return a response in time."
          : "The agent URL did not return a response in time.",
        action: isCloudflare
          ? "Check cloudflared and the origin service. Dokuru will keep retrying."
          : "Check whether the agent service is running and reachable. Dokuru will keep retrying.",
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
          ? "The browser could not reach the tunnel or the tunnel did not expose a valid Dokuru agent response."
          : "The browser could not reach the agent URL.",
        action: isCloudflare
          ? "Check tunnel status, DNS, TLS, CORS, and whether the agent service is running behind Cloudflare. Dokuru will keep retrying."
          : "Check the agent service, URL, firewall, DNS, or TLS certificate. Dokuru will keep retrying.",
        retryable: true,
        severity: "warning",
        detail,
      });
    }
  }

  return issue({
    code: "unknown",
    title: "Connection check failed",
    message: "Dokuru could not classify the agent connection failure.",
    action: "Check the agent logs and URL, then retry the connection.",
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
    action: "Check whether Docker is running and whether the agent can access the Docker socket.",
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
      message: "The WebSocket connection was rejected by the agent.",
      action: "Edit this agent and paste the latest token. Auto-reconnect is paused until the token changes.",
      retryable: false,
      severity: "error",
      detail,
    });
  }

  if (code === 4003) {
    return issue({
      code: "access_denied",
      title: "Access denied",
      message: "The agent denied the WebSocket connection.",
      action: "Check token permissions and save the agent again.",
      retryable: false,
      severity: "error",
      detail,
    });
  }

  if (code === 1001 || code === 1012) {
    return issue({
      code: "agent_unreachable",
      title: code === 1012 ? "Agent restarting" : "Agent going away",
      message: "The agent closed the connection while it was going away or restarting.",
      action: "Wait for the service to come back. Dokuru will keep retrying.",
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
        ? "The tunnel or browser dropped the WebSocket connection."
        : "The browser lost the WebSocket connection to the agent.",
      action: isCloudflare
        ? "Check cloudflared and tunnel WebSocket support. Dokuru will keep retrying."
        : "Check network connectivity and whether the agent service is running. Dokuru will keep retrying.",
      retryable: true,
      severity: "warning",
      detail,
    });
  }

  if (code === 1000) {
    return issue({
      code: "connection_closed",
      title: "Connection closed",
      message: "The agent closed the WebSocket connection normally.",
      action: "Dokuru will reconnect to keep live status updated.",
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
