import type { User } from "@/features/auth/types/auth-types";

// Extended user with timestamps (for admin view)
export interface UserWithTimestamps extends User {
  created_at?: string;
  updated_at?: string;
}

// Log level request
export interface LogLevelRequest {
  level: "trace" | "debug" | "info" | "warn" | "error";
}

// Backward compatible alias
export type { LogLevelRequest as ChangeLogLevelRequest };

export interface DashboardStats {
  total_users: number;
  total_admins: number;
  total_api_keys: number;
  active_api_keys: number;
  new_users_this_month: number;
}

export interface ApiKey {
  id: string;
  name: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}
