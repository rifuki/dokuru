// When embedded, we use the same host. When in dev mode, we connect to 3939
export const API_URL = import.meta.env.DEV 
  ? "http://localhost:3939/api/v1" 
  : "/api/v1";

export const WS_BASE_URL = import.meta.env.DEV
  ? "ws://localhost:3939/ws"
  : `ws://${window.location.host}/ws`;
