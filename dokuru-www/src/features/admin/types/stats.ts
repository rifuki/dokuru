export interface DashboardStats {
  // User stats
  total_users: number;
  total_admins: number;
  new_users_this_month: number;

  // Agent stats
  total_agents: number;
  active_agents: number;
  agents_by_mode: {
    direct: number;
    cloudflare: number;
    domain: number;
    relay: number;
  };
  relay_agents_count: number;

  // Audit stats
  total_audits: number;
  audits_this_month: number;
  average_score: number;
  audit_activity: Array<{
    date: string;
    count: number;
  }>;

  // API Keys
  total_api_keys: number;
  active_api_keys: number;

  // Recent registrations
  recent_registrations: Array<{
    id: string;
    username: string | null;
    email: string;
    email_verified: boolean;
    role: string;
    created_at: string;
  }>;

  // System health
  system_health: {
    database: ComponentHealth;
    redis: ComponentHealth | null;
    server_uptime_seconds: number;
    active_websockets: number;
  };
}

export interface ComponentHealth {
  status: "healthy" | "degraded" | "down";
  response_time_ms: number;
}

export interface AdminAgent {
  id: string;
  user_id: string;
  user_email: string;
  name: string;
  url: string;
  access_mode: string;
  status: string;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAgentListResponse {
  agents: AdminAgent[];
  total: number;
}

export interface AdminAudit {
  id: string;
  agent_id: string;
  agent_name: string;
  user_email: string;
  hostname: string;
  docker_version: string;
  total_rules: number;
  passed: number;
  failed: number;
  score: number;
  ran_at: string;
  created_at: string;
}

export interface AdminAuditListResponse {
  audits: AdminAudit[];
  total: number;
}
