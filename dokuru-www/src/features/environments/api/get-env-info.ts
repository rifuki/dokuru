import axios from 'axios';

export interface ContainerStats {
  total: number;
  running: number;
  stopped: number;
  healthy: number;
  unhealthy: number;
}

export interface EnvironmentInfo {
  docker_version: string;
  os: string;
  architecture: string;
  containers: ContainerStats;
  stacks: number;
  volumes: number;
  images: number;
  networks: number;
  cpu_count: number;
  memory_total: number;
}

export async function getEnvInfo(baseUrl: string): Promise<EnvironmentInfo> {
  const res = await axios.get<{ data: EnvironmentInfo }>(`${baseUrl}/api/v1/info`, {
    timeout: 5000,
  });
  return res.data.data;
}
