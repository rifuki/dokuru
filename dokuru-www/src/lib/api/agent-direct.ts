import axios from "axios";

export interface DockerInfo {
  version: string;
  containers: {
    total: number;
    running: number;
    stopped: number;
  };
  images: number;
  volumes: number;
  networks: number;
}

export const agentDirectApi = {
  getInfo: async (agentUrl: string): Promise<DockerInfo> => {
    const response = await axios.get(`${agentUrl}/api/v1/info`);
    return response.data.data;
  },
};
