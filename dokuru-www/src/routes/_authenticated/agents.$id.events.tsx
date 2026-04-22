import { createFileRoute } from "@tanstack/react-router";
import { Activity, Download, Pause, Play, Trash2, Filter } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useDockerEvents } from "@/hooks/useDockerEvents";
import { useAgentStore, getAgentToken } from "@/stores/use-agent-store";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function EventsPage() {
  const { id } = Route.useParams();
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === id));
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  const agentToken = agent ? (agent.token ?? getAgentToken(agent.id) ?? "") : "";

  const { events, clearEvents, isConnected } = useDockerEvents(
    agent?.url || "",
    agentToken,
    { enabled: !paused && !!agent }
  );

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesType = typeFilter === "all" || event.type.toLowerCase() === typeFilter;
      const matchesSearch =
        !filter ||
        event.type.toLowerCase().includes(filter.toLowerCase()) ||
        event.action.toLowerCase().includes(filter.toLowerCase()) ||
        event.actor.id.toLowerCase().includes(filter.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [events, filter, typeFilter]);

  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEvents.slice(start, start + itemsPerPage);
  }, [filteredEvents, currentPage]);

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);

  const exportToJSON = () => {
    const data = JSON.stringify(filteredEvents, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `docker-events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToTXT = () => {
    const data = filteredEvents
      .map((e) => {
        const date = new Date(e.time * 1000).toLocaleString();
        const name = e.actor.attributes.name || e.actor.id.slice(0, 12);
        return `${date} ${e.type} ${e.action}: ${name}`;
      })
      .join("\n");
    const blob = new Blob([data], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `docker-events-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getEventColor = (type: string) => {
    const colors: Record<string, string> = {
      container: "text-blue-400",
      image: "text-purple-400",
      network: "text-green-400",
      volume: "text-yellow-400",
      exec: "text-cyan-400",
    };
    return colors[type.toLowerCase()] || "text-gray-400";
  };

  const getActionBadge = (action: string) => {
    const badges: Record<string, string> = {
      create: "bg-green-500/10 text-green-400 border-green-500/20",
      start: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      stop: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      destroy: "bg-red-500/10 text-red-400 border-red-500/20",
      die: "bg-red-500/10 text-red-400 border-red-500/20",
      kill: "bg-red-500/10 text-red-400 border-red-500/20",
      exec_create: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      exec_start: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    };
    return badges[action.toLowerCase()] || "bg-muted/20 text-muted-foreground border-border";
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-4">
      <PageHeader
        icon={Activity}
        title="Events"
        stats={[
          {
            value: isConnected ? "Live" : "Disconnected",
            label: "real-time stream",
            pulse: isConnected,
          },
        ]}
      />

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaused(!paused)}
            className="gap-2"
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" size="sm" onClick={clearEvents} className="gap-2">
            <Trash2 className="size-4" />
            Clear
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-1">
          <Input
            placeholder="Search events..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <Filter className="size-4 mr-2" />
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
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportToJSON} className="gap-2">
            <Download className="size-4" />
            JSON
          </Button>
          <Button variant="outline" size="sm" onClick={exportToTXT} className="gap-2">
            <Download className="size-4" />
            TXT
          </Button>
        </div>
      </div>

      {/* Events List */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {paginatedEvents.length} of {filteredEvents.length} events
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        <div className="divide-y divide-border">
          {paginatedEvents.length === 0 ? (
            <div className="p-16 text-center text-muted-foreground">
              {paused ? "Stream paused" : "No events yet"}
            </div>
          ) : (
            paginatedEvents.map((event, idx) => {
              const date = new Date(event.time * 1000);
              const timestamp = date.toLocaleString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              });
              const name = event.actor.attributes.name || event.actor.id.slice(0, 12);

              return (
                <div
                  key={`${event.time}-${idx}`}
                  className="p-3 hover:bg-muted/5 transition-colors font-mono text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-xs">{timestamp}</span>
                    <span className={`font-medium ${getEventColor(event.type)}`}>
                      {event.type}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border text-xs ${getActionBadge(
                        event.action
                      )}`}
                    >
                      {event.action}
                    </span>
                    <span className="text-foreground">{name}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
