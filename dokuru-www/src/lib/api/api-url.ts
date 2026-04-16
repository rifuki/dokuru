/**
 * API URL Configuration
 * Centralized API base URL management
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:9393";

export const http_api_url = API_BASE_URL;

export function getApiUrl(path: string): string {
  return `${http_api_url}${path}`;
}
