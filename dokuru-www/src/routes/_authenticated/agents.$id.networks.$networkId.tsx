import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  canUseDockerAgent,
  dockerApi,
  dockerCredential,
  type Container as DockerContainer,
} from "@/services/docker-api";
import { agentApi } from "@/lib/api/agent";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  Clock,
  Container as ContainerIcon,
  Globe,
  Hash,
  Network,
  Router,
  Tag,
} from "lucide-react";
import {
  DetailPageSkeleton,
  DetailRow,
  DetailSection,
  DetailStat,
  RawJsonDetails,
} from "@/components/ui/detail-layout";

export const Route = createFileRoute("/_authenticated/agents/$id/networks/$networkId")({
  component: NetworkDetailPage,
});

type NetworkInspect = {
  Containers?: Record<
    string,
    {
      EndpointID?: string;
      IPv4Address?: string;
      IPv6Address?: string;
      MacAddress?: string;
      Name?: string;
    }
  >;
  Created?: string;
  EnableIPv6?: boolean;
  Name?: string;
  Id?: string;
  Driver?: string;
  IPAM?: {
    Driver?: string;
    Config?: Array<{
      Subnet?: string;
      Gateway?: string;
      IPRange?: string;
      AuxAddress?: Record<string, string>;
    }>;
  };
  Internal?: boolean;
  Attachable?: boolean;
  Ingress?: boolean;
  Scope?: string;
  Labels?: Record<string, string>;
  Options?: Record<string, string>;
};

function formatDate(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function formatBool(value?: boolean) {
  if (value === undefined) return null;
  return value ? "yes" : "no";
}

function shortValue(value?: string) {
  return value ? value.slice(0, 12) : null;
}

function stateColor(state?: string) {
  switch (state?.toLowerCase()) {
    case "running":
      return "bg-primary/10 text-primary border-primary/25";
    case "exited":
      return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "paused":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "restarting":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    default:
      return "bg-muted text-muted-foreground border-muted";
  }
}

function NetworkDetailPage() {
  const { id, networkId } = Route.useParams();

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentApi.getById(id),
  });

  const { data: network, isLoading } = useQuery({
    queryKey: ["network", id, networkId],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");
      const res = await dockerApi.inspectNetwork(agent.url, credential, networkId);
      return res.data as NetworkInspect;
    },
    enabled: canUseDockerAgent(agent),
  });

  const { data: allContainers = [] } = useQuery({
    queryKey: ["containers", id, true],
    queryFn: async () => {
      const credential = dockerCredential(agent);
      if (!agent || !credential) throw new Error("Agent token not available");
      const res = await dockerApi.listContainers(agent.url, credential, true);
      return res.data;
    },
    enabled: canUseDockerAgent(agent) && !!network,
  });

  if (isLoading) {
    return <DetailPageSkeleton />;
  }

  const containers = network?.Containers || {};
  const containerEntries = Object.entries(containers);
  const ipamConfig = network?.IPAM?.Config ?? [];
  const primaryConfig = ipamConfig[0];
  const created = formatDate(network?.Created);
  const title = network?.Name || networkId;
  const shortId = shortValue(network?.Id) ?? shortValue(networkId);
  const labelEntries = Object.entries(network?.Labels ?? {});
  const optionEntries = Object.entries(network?.Options ?? {});
  const containersById = new Map<string, DockerContainer>();
  for (const container of allContainers) {
    containersById.set(container.id, container);
  }

  function containerMeta(containerId: string) {
    return (
      containersById.get(containerId) ??
      allContainers.find((container) =>
        container.id.startsWith(containerId) || containerId.startsWith(container.id),
      )
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary shrink-0">
          <Network className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight truncate">{title}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {shortId && (
              <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {shortId}
              </span>
            )}
            {network?.Driver && (
              <Badge variant="outline" className="text-xs">
                {network.Driver}
              </Badge>
            )}
            {network?.Internal && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                internal
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DetailStat icon={Router} label="Driver" value={network?.Driver ?? "N/A"} />
        <DetailStat icon={Globe} label="Scope" value={network?.Scope ?? "N/A"} />
        <DetailStat icon={ContainerIcon} label="Containers" value={containerEntries.length} />
        <DetailStat icon={Clock} label="Created" value={created ?? "N/A"} />
      </div>

      <DetailSection
        title={`Connected Containers (${containerEntries.length})`}
        icon={ContainerIcon}
        contentClassName="space-y-2"
      >
        {containerEntries.length > 0 ? (
          containerEntries.map(([cid, info]) => {
            const meta = containerMeta(cid);
            const name = info.Name || meta?.names[0]?.replace(/^\/+/, "") || shortValue(cid);

            return (
              <Link
                key={cid}
                to="/agents/$id/containers/$containerId"
                params={{ id, containerId: cid }}
                className="group flex items-center gap-3 rounded-lg border bg-muted/20 px-3.5 py-3 min-w-0 transition-colors hover:border-primary/45 hover:bg-primary/5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <ContainerIcon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-mono text-sm font-medium truncate">{name}</p>
                    <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {shortValue(cid)}
                    </span>
                    {meta?.state && (
                      <Badge variant="outline" className={`text-xs shrink-0 ${stateColor(meta.state)}`}>
                        {meta.state}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {meta?.image && (
                      <span className="font-mono text-xs text-muted-foreground truncate max-w-full">
                        {meta.image}
                      </span>
                    )}
                    {info.IPv4Address && (
                      <Badge variant="outline" className="font-mono text-xs">
                        {info.IPv4Address}
                      </Badge>
                    )}
                    {info.IPv6Address && (
                      <Badge variant="outline" className="font-mono text-xs">
                        {info.IPv6Address}
                      </Badge>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground italic">No containers connected.</p>
        )}
      </DetailSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DetailSection title="Network Details" icon={Hash}>
          <DetailRow label="Full ID" value={network?.Id} mono />
          <DetailRow label="Created" value={created} />
          <DetailRow label="Driver" value={network?.Driver} mono />
          <DetailRow
            label="Scope"
            value={
              network?.Scope ? (
                <Badge variant="outline" className="font-mono text-xs">
                  {network.Scope}
                </Badge>
              ) : null
            }
          />
          <DetailRow label="IPAM Driver" value={network?.IPAM?.Driver} mono />
          <DetailRow label="Subnet" value={primaryConfig?.Subnet} mono />
          <DetailRow label="Gateway" value={primaryConfig?.Gateway} mono />
          <DetailRow label="IP Range" value={primaryConfig?.IPRange} mono />
          <DetailRow label="Attachable" value={formatBool(network?.Attachable)} />
          <DetailRow label="IPv6" value={formatBool(network?.EnableIPv6)} />
          <DetailRow label="Ingress" value={formatBool(network?.Ingress)} />
        </DetailSection>

        {(labelEntries.length > 0 || optionEntries.length > 0) && (
          <div className="space-y-6">
          {labelEntries.length > 0 && (
            <DetailSection title={`Labels (${labelEntries.length})`} icon={Tag} contentClassName="space-y-2">
              {labelEntries.map(([key, value]) => (
                <div key={key} className="rounded-lg bg-muted/40 p-3 min-w-0">
                  <p className="font-mono text-xs text-primary break-all">{key}</p>
                  {value && (
                    <p className="font-mono text-xs text-muted-foreground break-all mt-1">
                      {value}
                    </p>
                  )}
                </div>
              ))}
            </DetailSection>
          )}

          {optionEntries.length > 0 && (
            <DetailSection title="Options" icon={Globe} contentClassName="space-y-2">
              {optionEntries.map(([key, value]) => (
                <div key={key} className="rounded-lg bg-muted/40 p-3 min-w-0">
                  <p className="font-mono text-xs text-primary break-all">{key}</p>
                  {value && (
                    <p className="font-mono text-xs text-muted-foreground break-all mt-1">
                      {value}
                    </p>
                  )}
                </div>
              ))}
            </DetailSection>
          )}
          </div>
        )}
      </div>

      {ipamConfig.length > 1 && (
        <DetailSection title="Additional IPAM Config" icon={Router} contentClassName="space-y-2">
          {ipamConfig.slice(1).map((config, index) => (
            <div key={index} className="rounded-lg bg-muted/40 p-3 min-w-0">
              <div className="grid gap-1 text-sm">
                {config.Subnet && <p className="font-mono break-all">subnet: {config.Subnet}</p>}
                {config.Gateway && <p className="font-mono break-all">gateway: {config.Gateway}</p>}
                {config.IPRange && <p className="font-mono break-all">range: {config.IPRange}</p>}
              </div>
            </div>
          ))}
        </DetailSection>
      )}

      <RawJsonDetails data={network} />
    </div>
  );
}
