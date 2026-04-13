import axios from "axios";

// When embedded, we use the same host. When in dev mode, we connect to 3939
export const API_BASE_URL = import.meta.env.DEV 
  ? "http://localhost:3939/api/v1" 
  : "/api/v1";

export const WS_BASE_URL = import.meta.env.DEV
  ? "ws://localhost:3939/ws"
  : `ws://${window.location.host}/ws`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export const dokuruApi = {
  health: () => api.get("/health/detail").then(res => res.data),
  rules: () => api.get("/rules").then(res => res.data),
  containers: () => api.get("/containers").then(res => res.data),
  audit: () => api.get("/audit").then(res => res.data),
  auditRule: (ruleId: string) => api.get(`/audit/${ruleId}`).then(res => res.data),
  fix: (ruleId: string) => api.post("/fix", { rule_id: ruleId }).then(res => res.data),
};
