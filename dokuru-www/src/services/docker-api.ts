import { apiClient } from "@/lib/api";

export interface Container {
  id: string;
  names: string[];
  image: string;
  state: string;
  status: string;
  created: number;
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

export const dockerApi = {
  // Containers
  listContainers: (agentUrl: string, token: string, all = true) =>
    apiClient.get<Container[]>(`${agentUrl}/docker/containers?all=${all}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  inspectContainer: (agentUrl: string, token: string, id: string) =>
    apiClient.get(`${agentUrl}/docker/containers/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  startContainer: (agentUrl: string, token: string, id: string) =>
    apiClient.post(`${agentUrl}/docker/containers/${id}/start`, null, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  stopContainer: (agentUrl: string, token: string, id: string) =>
    apiClient.post(`${agentUrl}/docker/containers/${id}/stop`, null, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  restartContainer: (agentUrl: string, token: string, id: string) =>
    apiClient.post(`${agentUrl}/docker/containers/${id}/restart`, null, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  removeContainer: (agentUrl: string, token: string, id: string) =>
    apiClient.delete(`${agentUrl}/docker/containers/${id}/remove`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getContainerLogs: (agentUrl: string, token: string, id: string) =>
    apiClient.get<string[]>(`${agentUrl}/docker/containers/${id}/logs`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  getContainerStats: (agentUrl: string, token: string, id: string) =>
    apiClient.get<ContainerStats>(`${agentUrl}/docker/containers/${id}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // Images
  listImages: (agentUrl: string, token: string, all = true) =>
    apiClient.get<Image[]>(`${agentUrl}/docker/images?all=${all}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  removeImage: (agentUrl: string, token: string, id: string) =>
    apiClient.delete(`${agentUrl}/docker/images/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  pullImage: (agentUrl: string, token: string, fromImage: string, tag = "latest") =>
    apiClient.post(
      `${agentUrl}/docker/images/pull?from_image=${fromImage}&tag=${tag}`,
      null,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    ),

  pruneImages: (agentUrl: string, token: string) =>
    apiClient.post(`${agentUrl}/docker/images/prune`, null, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // Networks
  listNetworks: (agentUrl: string, token: string) =>
    apiClient.get<Network[]>(`${agentUrl}/docker/networks`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  removeNetwork: (agentUrl: string, token: string, id: string) =>
    apiClient.delete(`${agentUrl}/docker/networks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // Volumes
  listVolumes: (agentUrl: string, token: string) =>
    apiClient.get<Volume[]>(`${agentUrl}/docker/volumes`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  removeVolume: (agentUrl: string, token: string, name: string) =>
    apiClient.delete(`${agentUrl}/docker/volumes/${name}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  pruneVolumes: (agentUrl: string, token: string) =>
    apiClient.post(`${agentUrl}/docker/volumes/prune`, null, {
      headers: { Authorization: `Bearer ${token}` },
    }),
};
