import { createFileRoute } from "@tanstack/react-router";
import { Activity, Download, Pause, Play, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useDockerEvents } from "@/hooks/useDockerEvents";
import { useAgentStore, getAgentToken } from "@/stores/use-agent-store";
import { dockerCredential } from "@/services/docker-api";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWindowScrollMemory } from "@/hooks/use-window-scroll-memory";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/agents/$id/events")({
  component: EventsPage,
});

const TYPE_COLORS: Record<string, string> = {
  container: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  image:     "bg-purple-500/10 text-purple-400 border-purple-500/20",
  network:   "bg-green-500/10 text-green-400 border-green-500/20",
  volume:    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  exec:      "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

const ACTION_COLORS: Record<string, string> = {
  create:      "bg-emerald-500/10 text-emerald-400",
  start:       "bg-blue-500/10 text-blue-400",
  stop:        "bg-yellow-500/10 text-yellow-400",
  destroy:     "bg-red-500/10 text-red-400",
  die:         "bg-red-500/10 text-red-400",
  kill:        "bg-red-500/10 text-red-400",
  exec_create: "bg-cyan-500/10 text-cyan-400",
  exec_start:  "bg-cyan-500/10 text-cyan-400",
  pull:        "bg-indigo-500/10 text-indigo-400",
  push:        "bg-indigo-500/10 text-indigo-400",
  tag:         "bg-slate-500/10 text-slate-400",
};

const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
const EVENT_ROW_HEIGHT_PX = 64;
const EVENT_GRID_COLUMNS = "grid-cols-[180px_90px_280px_minmax(0,1fr)]";

function EventsPage() {
  const { id } = Route.useParams();
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === id));
  useWindowScrollMemory(`agent:${id}:events`, true);
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(10);

  const agentToken = agent
    ? agent.access_mode === "relay"
      ? dockerCredential(agent)
      : agent.token ?? getAgentToken(agent.id) ?? ""
    : "";

  const { events, clearEvents, isConnected, isConnecting } = useDockerEvents(
    agent?.url ?? "",
    agentToken,
    { enabled: !paused && !!agent, historySecs: 86400 },
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return events.filter((e) => {
      if (typeFilter !== "all" && e.type.toLowerCase() !== typeFilter) return false;
      if (!q) return true;
      const name = e.actor.attributes.name ?? e.actor.id.slice(0, 12);
      return (
        e.type.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        e.actor.id.toLowerCase().includes(q)
      );
    });
  }, [events, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageEvents = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `docker-events-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportTXT = () => {
    const text = filtered.map((e) => {
      const ts = new Date(e.time * 1000).toLocaleString();
      const name = e.actor.attributes.name ?? e.actor.id.slice(0, 12);
      return `${ts}  ${e.type.padEnd(10)} ${e.action.padEnd(15)} ${name}`;
    }).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `docker-events-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const statusLabel = isConnecting ? "Connecting…" : isConnected ? "Live" : "Disconnected";

  return (
    <div className="max-w-7xl mx-auto w-full space-y-4">
      <PageHeader
        icon={Activity}
        title="Events"
        stats={[
          {
            value: statusLabel,
            label: "real-time stream",
            pulse: isConnected,
          },
        ]}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)} className="flex-1 gap-2 sm:flex-none">
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button variant="outline" size="sm" onClick={clearEvents} className="flex-1 gap-2 sm:flex-none">
          <Trash2 className="size-4" /> Clear
        </Button>

        <Input
          placeholder="Search type, action, name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="order-last w-full sm:order-none sm:max-w-56"
        />

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="container">Container</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="network">Network</SelectItem>
            <SelectItem value="volume">Volume</SelectItem>
            <SelectItem value="exec">Exec</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
          <Select
            value={String(perPage)}
            onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PER_PAGE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportJSON} className="ml-auto gap-2 sm:ml-0">
            <Download className="size-4" /> JSON
          </Button>
          <Button variant="outline" size="sm" onClick={exportTXT} className="gap-2">
            <Download className="size-4" /> TXT
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        {/* Header */}
        <div className={`grid ${EVENT_GRID_COLUMNS} min-w-[920px] gap-x-4 px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
          <span>Date</span>
          <span>Type</span>
          <span>Action</span>
          <span>Actor</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border" style={{ minHeight: `${perPage * EVENT_ROW_HEIGHT_PX}px` }}>
          {pageEvents.length === 0 ? (
            <div
              className="flex min-w-[920px] items-center justify-center text-center text-sm text-muted-foreground"
              style={{ height: `${perPage * EVENT_ROW_HEIGHT_PX}px` }}
            >
              {paused ? "Stream paused — resume to see new events" : isConnecting ? "Connecting to event stream…" : "No events yet"}
            </div>
          ) : (
            Array.from({ length: perPage }).map((_, idx) => {
              const event = pageEvents[idx];

              if (!event) {
                return <div key={`empty-${safePage}-${idx}`} className="h-16 min-w-[920px]" aria-hidden="true" />;
              }

              const ts = new Date(event.time * 1000).toLocaleString("en-US", {
                month: "2-digit", day: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit", second: "2-digit",
                hour12: false,
              });
              const type = event.type.toLowerCase();
              const action = event.action.toLowerCase();
              const name = event.actor.attributes.name ?? event.actor.id.slice(0, 12);
              const image = event.actor.attributes.image;

              return (
                <div
                  key={`${event.time}-${event.actor.id}-${idx}`}
                  className={`grid h-16 ${EVENT_GRID_COLUMNS} min-w-[920px] gap-x-4 px-4 hover:bg-muted/5 transition-colors text-sm font-mono items-center`}
                >
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{ts}</span>

                  <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded border text-[11px] font-semibold uppercase ${TYPE_COLORS[type] ?? "bg-muted/20 text-muted-foreground border-border"}`}>
                    {event.type}
                  </span>

                  <span
                    title={event.action}
                    className={`inline-flex min-w-0 max-w-full items-center rounded px-2 py-0.5 text-[11px] font-medium ${ACTION_COLORS[action] ?? "bg-muted/10 text-muted-foreground"}`}
                  >
                    <span className="truncate">{event.action}</span>
                  </span>

                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <span title={name} className="max-w-[45%] shrink-0 truncate font-semibold text-foreground">{name}</span>
                    {image && (
                      <span title={image} className="min-w-0 truncate text-xs text-muted-foreground">{image}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer / Pagination */}
        <div className="min-w-[920px] px-4 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {filtered.length === 0
              ? "No events"
              : `Showing ${(safePage - 1) * perPage + 1}–${Math.min(safePage * perPage, filtered.length)} of ${filtered.length} events`}
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(1)} disabled={safePage === 1}>«</Button>
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>‹</Button>
              <span className="px-3 tabular-nums">{safePage} / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>›</Button>
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
