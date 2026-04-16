import { API_URL } from "@/lib/env";

const API_PATH = "/api/v1";

// Parse the API URL
const urlObject = new URL(API_URL);

// Protocols for HTTP and WebSocket
const httpProtocol = urlObject.protocol.replace(":", "");
const wsProtocol = httpProtocol === "https" ? "wss" : "ws";

const BASE_API_URL = `${urlObject.host}${API_PATH}`;

// Construct URLs
export const httpApiUrl = `${httpProtocol}://${BASE_API_URL}`;
export const wsApiUrl = `${wsProtocol}://${BASE_API_URL}`;

// Simple getter for base URL
export function getApiUrl(): string {
  return API_URL;
}
