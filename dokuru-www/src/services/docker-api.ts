import axios, { type AxiosPromise } from "axios";
import { apiClient } from "@/lib/api";
import { LOCAL_AGENT_ID } from "@/lib/local-agent";
import { getAgentToken } from "@/stores/use-agent-store";

export interface Container {
  id: string;
  names: string[];
  image: string;
  state: string;
  status: string;
  created: number;
  labels?: Record<string, string>;
}

export interface ContainerStats {
  cpu_stats: {
    cpu_usage: {
      total_usage: number;
    };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage: number;
    limit: number;
  };
}

export interface Image {
  id: string;
  repo_tags: string[];
  size: number;
  created: number;
}

export interface ImageHistoryItem {
  Id: string;
  Created: number;
  CreatedBy: string;
  Tags: string[] | null;
  Size: number;
  Comment: string;
}

export interface Network {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

export interface Volume {
  name: string;
  driver: string;
  mountpoint: string;
}

export interface StackContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  service: string;
}

export interface Stack {
  name: string;
  working_dir: string | null;
  config_file: string | null;
  containers: StackContainer[];
  running: number;
  total: number;
}

type DockerAgentLike = {
  id: string;
  token?: string | null;
  access_mode?: string | null;
};

type DockerQuery = Record<string, string | number | boolean | undefined>;

export function dockerCredential(agent: DockerAgentLike | null | undefined) {
  if (!agent) return "";
  return agent.access_mode === "relay" ? agent.id : agent.token ?? getAgentToken(agent.id) ?? "";
}

export function canUseDockerAgent(agent: DockerAgentLike | null | undefined) {
  return agent?.id === LOCAL_AGENT_ID || !!dockerCredential(agent);
}

function dockerRequest<T>(
  agentUrl: string,
  credential: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  params?: DockerQuery,
  data?: unknown,
): AxiosPromise<T> {
  if (agentUrl === "relay") {
    return apiClient.request<T>({
      method,
      url: `/agents/${credential}${path}`,
      params,
      data,
    });
  }

  return axios.request<T>({
    method,
    url: `${agentUrl}${path}`,
    params,
    data,
    headers: { Authorization: `Bearer ${credential}` },
  });
}

export const dockerApi = {
  // Containers
  listContainers: (agentUrl: string, token: string, all = true) =>
    dockerRequest<Container[]>(agentUrl, token, "GET", "/docker/containers", { all }),

  inspectContainer: (agentUrl: string, token: string, id: string) =>
    dockerRequest(agentUrl, token, "GET", `/docker/containers/${encodeURIComponent(id)}`),

  startContainer: (agentUrl: string, token: string, id: string) =>
    dockerRequest(agentUrl, token, "POST", `/docker/containers/${encodeURIComponent(id)}/start`),

  stopContainer: (agentUrl: string, token: string, id: string) =>
    dockerRequest(agentUrl, token, "POST", `/docker/containers/${encodeURIComponent(id)}/stop`),

  restartContainer: (agentUrl: string, token: string, id: string) =>
    dockerRequest(agentUrl, token, "POST", `/docker/containers/${encodeURIComponent(id)}/restart`),

  removeContainer: (agentUrl: string, token: string, id: string) =>
    dockerRequest(agentUrl, token, "DELETE", `/docker/containers/${encodeURIComponent(id)}`),

  getContainerLogs: (agentUrl: string, token: string, id: string) =>
    dockerRequest<string[]>(agentUrl, token, "GET", `/docker/containers/${encodeURIComponent(id)}/logs`),

  getContainerStats: (agentUrl: string, token: string, id: string) =>
    dockerRequest<ContainerStats>(agentUrl, token, "GET", `/docker/containers/${encodeURIComponent(id)}/stats`),

  detectContainerShell: (agentUrl: string, token: string, id: string) =>
    dockerRequest<{ shell: string }>(agentUrl, token, "GET", `/docker/containers/${encodeURIComponent(id)}/shell`),

  // Images
  listImages: (agentUrl: string, token: string, all = true) =>
    dockerRequest<Image[]>(agentUrl, token, "GET", "/docker/images", { all }),

  inspectImage: (agentUrl: string, token: string, id: string) =>
    dockerRequest(agentUrl, token, "GET", `/docker/images/${encodeURIComponent(id)}`),

  imageHistory: (agentUrl: string, token: string, id: string) =>
    dockerRequest<ImageHistoryItem[]>(agentUrl, token, "GET", `/docker/images/${encodeURIComponent(id)}/history`),

  removeImage: (agentUrl: string, token: string, id: string) =>
    dockerRequest(agentUrl, token, "DELETE", `/docker/images/${encodeURIComponent(id)}`),

  pullImage: (agentUrl: string, token: string, fromImage: string, tag = "latest") =>
    dockerRequest(agentUrl, token, "POST", "/docker/images/pull", { from_image: fromImage, tag }),

  pruneImages: (agentUrl: string, token: string) =>
    dockerRequest(agentUrl, token, "POST", "/docker/images/prune"),

  // Stacks
  listStacks: (agentUrl: string, token: string) =>
    dockerRequest<Stack[]>(agentUrl, token, "GET", "/docker/stacks"),

  getStack: (agentUrl: string, token: string, name: string) =>
    dockerRequest<Stack>(agentUrl, token, "GET", `/docker/stacks/${encodeURIComponent(name)}`),

  getStackCompose: (agentUrl: string, token: string, name: string) =>
    dockerRequest<{ path: string; content: string }>(agentUrl, token, "GET", `/docker/stacks/${encodeURIComponent(name)}/compose`),

  updateStackCompose: (agentUrl: string, token: string, name: string, content: string) =>
    dockerRequest<{ path: string; content: string }>(agentUrl, token, "PUT", `/docker/stacks/${encodeURIComponent(name)}/compose`, undefined, { content }),

  // Networks
  listNetworks: (agentUrl: string, token: string) =>
    dockerRequest<Network[]>(agentUrl, token, "GET", "/docker/networks"),

  inspectNetwork: (agentUrl: string, token: string, id: string) =>
    dockerRequest(agentUrl, token, "GET", `/docker/networks/${encodeURIComponent(id)}`),

  removeNetwork: (agentUrl: string, token: string, id: string) =>
    dockerRequest(agentUrl, token, "DELETE", `/docker/networks/${encodeURIComponent(id)}`),

  // Volumes
  listVolumes: (agentUrl: string, token: string) =>
    dockerRequest<Volume[]>(agentUrl, token, "GET", "/docker/volumes"),

  inspectVolume: (agentUrl: string, token: string, name: string) =>
    dockerRequest(agentUrl, token, "GET", `/docker/volumes/${encodeURIComponent(name)}`),

  removeVolume: (agentUrl: string, token: string, name: string) =>
    dockerRequest(agentUrl, token, "DELETE", `/docker/volumes/${encodeURIComponent(name)}`),

  pruneVolumes: (agentUrl: string, token: string) =>
    dockerRequest(agentUrl, token, "POST", "/docker/volumes/prune"),
};
