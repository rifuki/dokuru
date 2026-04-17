export interface Agent {
  id: string;
  name: string;
  url: string;
  access_mode: string;
  status: string;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
  token?: string; // Only returned on create
}

export interface CreateAgentDto {
  name: string;
  url: string;
  token: string;
}

export interface UpdateAgentDto {
  name: string;
  url: string;
  token?: string;
}
