export interface Agent {
  id: string;
  name: string;
  url: string;
  access_mode: string;
  status: string;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
  token?: string; // Returned when the backend can decrypt the stored agent token.
}

export interface CreateAgentDto {
  name: string;
  url: string;
  token: string;
  access_mode: string;
}

export interface UpdateAgentDto {
  name: string;
  url: string;
  token?: string;
}
