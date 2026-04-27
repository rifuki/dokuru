import "@xterm/xterm/css/xterm.css";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { ChevronDown, Loader2, Plug, PlugZap, RotateCcw, Terminal as TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";

import { agentApi } from "@/lib/api/agent";
import { wsApiUrl } from "@/lib/api/api-config";
import { agentDirectApi } from "@/lib/api/agent-direct";
import { HOST_SHELLS, normalizeHostShell, type HostShellPath } from "@/lib/host-shell";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";

type TermStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function HostShellTerminal({
  agentId,
  agentUrl,
  accessMode,
  token,
}: {
  agentId: string;
  agentUrl: string;
  accessMode?: string;
  token?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const shellMenuRef = useRef<HTMLDivElement>(null);
  const [termDimensions, setTermDimensions] = useState({ cols: 100, rows: 30 });
  const [selectedShell, setSelectedShell] = useState<HostShellPath>("/bin/sh");
  const [detectedShell, setDetectedShell] = useState<HostShellPath | null>(null);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [shouldConnect, setShouldConnect] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isRelay = accessMode === "relay";
  const activeShell = selectedShell;

  const wsUrl = useMemo(() => {
    if (!shouldConnect || detectedShell === null) return null;
    const params = new URLSearchParams({
      cols: String(termDimensions.cols),
      rows: String(termDimensions.rows),
      shell: activeShell,
    });

    if (isRelay) {
      if (!accessToken) return null;
      params.set("access_token", accessToken);
      return `${wsApiUrl}/agents/${agentId}/host/shell/stream?${params.toString()}`;
    }

    if (!agentUrl || !token) return null;
    params.set("token", token);
    return `${agentUrl.replace(/^http/, "ws")}/host/shell/stream?${params.toString()}`;
  }, [accessToken, activeShell, agentId, agentUrl, detectedShell, isRelay, shouldConnect, termDimensions, token]);

  const { sendMessage, lastMessage, readyState, getWebSocket } = useWebSocket(wsUrl, {
    shouldReconnect: () => false,
    reconnectAttempts: 0,
    reconnectInterval: 0,
    retryOnError: false,
    share: false,
    onOpen: () => {
      if (termRef.current) termRef.current.options.disableStdin = false;
      const ws = getWebSocket();
      if (ws && "binaryType" in ws) ws.binaryType = "arraybuffer";
    },
    onClose: () => {
      if (termRef.current) termRef.current.options.disableStdin = true;
    },
    onError: () => {
      if (termRef.current) termRef.current.options.disableStdin = true;
    },
  }, wsUrl !== null);

  const status: TermStatus = readyState === ReadyState.OPEN ? "connected"
    : readyState === ReadyState.CONNECTING ? "connecting"
    : readyState === ReadyState.UNINSTANTIATED ? "idle"
    : readyState === ReadyState.CLOSED ? "disconnected"
    : "error";

  useEffect(() => {
    const detect = isRelay
      ? agentApi.detectHostShell(agentId)
      : agentDirectApi.detectHostShell(agentUrl, token);

    detect
      .then((info) => {
        const shell = normalizeHostShell(info.shell);
        setDetectedShell(shell);
        setSelectedShell(shell);
      })
      .catch(() => {
        setDetectedShell("/bin/sh");
        setSelectedShell("/bin/sh");
      });
  }, [agentId, agentUrl, isRelay, token]);

  useEffect(() => {
    if (!shellMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (shellMenuRef.current && !shellMenuRef.current.contains(event.target as Node)) {
        setShellMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shellMenuOpen]);

  const disposeTerminal = useCallback(() => {
    roRef.current?.disconnect();
    roRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
    setShouldConnect(false);
  }, []);

  const startTerminal = useCallback(() => {
    if (!wrapperRef.current || detectedShell === null) return;
    disposeTerminal();

    queueMicrotask(() => {
      if (!wrapperRef.current) return;
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"Cascadia Code", "Fira Code", monospace',
        theme: { background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff" },
        scrollback: 8000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(wrapperRef.current);
      fit.fit();
      termRef.current = term;
      fitRef.current = fit;
      setTermDimensions({ cols: term.cols, rows: term.rows });

      const ro = new ResizeObserver(() => {
        fit.fit();
        queueMicrotask(() => setTermDimensions({ cols: term.cols, rows: term.rows }));
      });
      ro.observe(wrapperRef.current);
      roRef.current = ro;
      setShouldConnect(true);
    });
  }, [detectedShell, disposeTerminal]);

  const disconnect = useCallback(() => {
    if (termRef.current) {
      termRef.current.write("\r\n\x1b[33mDokuru host shell disconnected\x1b[0m\r\n");
      termRef.current.options.disableStdin = true;
    }
    if (readyState === ReadyState.OPEN) {
      sendMessage(new TextEncoder().encode("exit\n"));
      setTimeout(() => getWebSocket()?.close(), 100);
    }
    setShouldConnect(false);
  }, [getWebSocket, readyState, sendMessage]);

  useEffect(() => disposeTerminal, [disposeTerminal]);

  useEffect(() => {
    if (!termRef.current) return;
    const disposable = termRef.current.onData((data) => {
      if (readyState === ReadyState.OPEN) sendMessage(new TextEncoder().encode(data));
    });
    return () => disposable.dispose();
  }, [readyState, sendMessage]);

  useEffect(() => {
    if (!termRef.current) return;
    const disposable = termRef.current.onResize(({ cols, rows }) => {
      if (readyState === ReadyState.OPEN) sendMessage(JSON.stringify({ type: "resize", cols, rows }));
    });
    return () => disposable.dispose();
  }, [readyState, sendMessage]);

  useEffect(() => {
    if (!lastMessage || !termRef.current) return;
    const data = lastMessage.data instanceof ArrayBuffer ? new Uint8Array(lastMessage.data) : lastMessage.data;
    termRef.current.write(data);
  }, [lastMessage]);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const shellLabel = selectedShell.split("/").pop();

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <TerminalIcon className="h-4 w-4 text-[#2496ED]" />
          <span className="truncate font-mono text-xs text-muted-foreground">vps://{agentId.slice(0, 8)}</span>
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
            isConnected ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
              : isConnecting ? "border-blue-500/25 bg-blue-500/10 text-blue-400"
              : "border-border bg-muted/40 text-muted-foreground"
          )}>
            {status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div ref={shellMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShellMenuOpen((value) => !value)}
              className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
              disabled={detectedShell === null || isConnected || isConnecting}
            >
              {detectedShell === null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : shellLabel}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {shellMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-32 overflow-hidden rounded-md border bg-popover shadow-lg">
                {HOST_SHELLS.map((shell) => (
                  <button
                    key={shell}
                    type="button"
                    onClick={() => {
                      setSelectedShell(shell);
                      setShellMenuOpen(false);
                    }}
                    className={cn(
                      "block w-full px-3 py-2 text-left font-mono text-xs hover:bg-accent",
                      selectedShell === shell && "bg-accent text-foreground"
                    )}
                  >
                    {shell}
                  </button>
                ))}
              </div>
            )}
          </div>
          {isConnected || isConnecting ? (
            <button type="button" onClick={disconnect} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <Plug className="h-3.5 w-3.5" /> Disconnect
            </button>
          ) : (
            <button type="button" onClick={startTerminal} disabled={detectedShell === null} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#2496ED] px-3 text-xs font-bold text-white hover:bg-[#1d7ac7] disabled:cursor-not-allowed disabled:opacity-60">
              {status === "disconnected" || status === "error" ? <RotateCcw className="h-3.5 w-3.5" /> : <PlugZap className="h-3.5 w-3.5" />}
              {status === "disconnected" || status === "error" ? "Reconnect" : "Connect Shell"}
            </button>
          )}
        </div>
      </div>

      <div className="relative bg-[#0d1117] p-2">
        <div ref={wrapperRef} className="h-[68vh] min-h-[420px] rounded-lg" />
        {!shouldConnect && (
          <div className="absolute inset-2 flex items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#0d1117] text-center">
            <div className="space-y-2 px-4">
              <TerminalIcon className="mx-auto h-8 w-8 text-[#2496ED]" />
              <p className="text-sm font-semibold text-white">Host shell is disconnected</p>
              <p className="max-w-md text-xs text-white/50">Connect only during trusted demos. This opens an interactive shell on the agent host.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
