export interface Agent {
  id: string;
  name: string;
  url: string;
  access_mode: string;
  status: string;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentDto {
  name: string;
  url: string;
  token: string;
}
