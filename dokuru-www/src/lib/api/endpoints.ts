/**
 * API Endpoints
 * Centralized endpoint definitions
 */

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/api/v1/auth/login",
    REGISTER: "/api/v1/auth/register",
    LOGOUT: "/api/v1/auth/logout",
    REFRESH: "/api/v1/auth/refresh",
    ME: "/api/v1/auth/me",
  },
  ENVIRONMENTS: {
    LIST: "/api/v1/environments",
    CREATE: "/api/v1/environments",
    DELETE: (id: string) => `/api/v1/environments/${id}`,
  },
} as const;
