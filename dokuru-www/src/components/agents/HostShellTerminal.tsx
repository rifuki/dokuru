import "@xterm/xterm/css/xterm.css";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { ChevronDown, Loader2, Plug, PlugZap, RotateCcw, Terminal as TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { agentApi } from "@/lib/api/agent";
import { agentDirectApi } from "@/lib/api/agent-direct";
import { HOST_SHELLS, normalizeHostShell, type HostShellPath } from "@/lib/host-shell";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";
import { useHostShellSession } from "@/stores/host-shell-session-store";

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
  const lastRenderedChunkIdRef = useRef(0);
  const shellMenuRef = useRef<HTMLDivElement>(null);
  const [termDimensions, setTermDimensions] = useState({ cols: 100, rows: 30 });
  const [selectedShell, setSelectedShell] = useState<HostShellPath>("/bin/sh");
  const [detectedShell, setDetectedShell] = useState<HostShellPath | null>(null);
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { session, snapshot } = useHostShellSession(agentId);
  const isRelay = accessMode === "relay";
  const availableShells = useMemo<HostShellPath[]>(() => {
    if (detectedShell === "/bin/zsh") return ["/bin/zsh", "/bin/bash", "/bin/sh"];
    if (detectedShell === "/bin/bash") return ["/bin/bash", "/bin/sh"];
    if (detectedShell === "/bin/sh") return ["/bin/sh"];
    return [];
  }, [detectedShell]);
  const activeShell = snapshot.status === "connected" || snapshot.status === "connecting"
    ? snapshot.shell
    : availableShells.includes(selectedShell)
    ? selectedShell
    : availableShells[0] ?? "/bin/sh";
  const status = snapshot.status;

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
  }, []);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const current = session.getSnapshot();

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      theme: { background: "#0d1117", foreground: "#c9d1d9", cursor: "#58a6ff" },
      scrollback: 8000,
      disableStdin: current.status !== "connected",
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(wrapperRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    setTermDimensions({ cols: term.cols, rows: term.rows });

    current.chunks.forEach((chunk) => term.write(chunk.data));
    lastRenderedChunkIdRef.current = current.chunks.at(-1)?.id ?? 0;

    const dataDisposable = term.onData((data) => {
      if (session.getSnapshot().status === "connected") session.send(new TextEncoder().encode(data));
    });
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      setTermDimensions({ cols, rows });
      if (session.getSnapshot().status === "connected") session.resize(cols, rows);
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      queueMicrotask(() => {
        setTermDimensions({ cols: term.cols, rows: term.rows });
        if (session.getSnapshot().status === "connected") session.resize(term.cols, term.rows);
      });
    });
    ro.observe(wrapperRef.current);
    roRef.current = ro;

    return () => {
      dataDisposable.dispose();
      resizeDisposable.dispose();
      disposeTerminal();
    };
  }, [agentId, disposeTerminal, session]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    for (const chunk of snapshot.chunks) {
      if (chunk.id > lastRenderedChunkIdRef.current) {
        term.write(chunk.data);
        lastRenderedChunkIdRef.current = chunk.id;
      }
    }

    term.options.disableStdin = snapshot.status !== "connected";
  }, [snapshot.chunks, snapshot.status]);

  const startTerminal = useCallback(() => {
    if (detectedShell === null) return;
    const cols = termRef.current?.cols ?? termDimensions.cols;
    const rows = termRef.current?.rows ?? termDimensions.rows;

    session.connect({
      agentId,
      agentUrl,
      accessMode,
      token,
      accessToken,
      shell: activeShell,
      cols,
      rows,
    });
  }, [accessMode, accessToken, activeShell, agentId, agentUrl, detectedShell, session, termDimensions, token]);

  const disconnect = useCallback(() => {
    session.disconnect();
  }, [session]);

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";
  const shellLabel = activeShell.split("/").pop();

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
                {HOST_SHELLS.map((shell) => {
                  const isAvailable = availableShells.includes(shell);
                  const isDefault = shell === detectedShell;
                  const isSelected = shell === activeShell;

                  return (
                    <button
                      key={shell}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => {
                        if (!isAvailable) return;
                        setSelectedShell(shell);
                        setShellMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-mono text-xs hover:bg-accent",
                        !isAvailable && "cursor-not-allowed text-muted-foreground/40 hover:bg-transparent",
                        isSelected && "bg-accent text-foreground"
                      )}
                    >
                      <span>{shell}</span>
                      {isDefault && (
                        <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1 py-0.5 text-[9px] text-emerald-400">
                          detected
                        </span>
                      )}
                    </button>
                  );
                })}
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
        {snapshot.status === "idle" && snapshot.chunks.length === 0 && (
          <div className="absolute inset-2 flex items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#0d1117] text-center">
            <div className="space-y-2 px-4">
              <TerminalIcon className="mx-auto h-8 w-8 text-[#2496ED]" />
              <p className="text-sm font-semibold text-white">Host shell is disconnected</p>
              <p className="max-w-md text-xs text-white/50">Connect only during trusted demos. The shell keeps running in the background while you navigate this app.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
