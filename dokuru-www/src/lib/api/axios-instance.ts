/**
 * Axios Instance Configuration
 * Global axios instance with interceptors for auth and error handling
 * 
 * SECURITY: Access token is stored in MEMORY (Zustand), not localStorage.
 * This prevents XSS attacks from stealing tokens.
 */

import axios from "axios";
import { http_api_url } from "./api-url";
import { API_ENDPOINTS } from "./endpoints";
import { useAuthStore } from "@/stores/use-auth-store";

const apiClient = axios.create({
  baseURL: http_api_url,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
  withCredentials: true, // Required for httpOnly cookies (refresh token)
});

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

function handleLogout() {
  useAuthStore.getState().actions.logout();
  window.location.href = "/login";
}

// Response Interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (
        originalRequest.url === API_ENDPOINTS.AUTH.LOGIN ||
        originalRequest.url === API_ENDPOINTS.AUTH.REGISTER ||
        originalRequest.url === API_ENDPOINTS.AUTH.REFRESH
      ) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        const response = await axios.post(
          `${http_api_url}${API_ENDPOINTS.AUTH.REFRESH}`,
          {},
          { withCredentials: true }
        );

        const { access_token } = response.data.data;
        useAuthStore.getState().actions.updateToken(access_token);
        onTokenRefreshed(access_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        handleLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (axios.isAxiosError(error) && error.response) {
      const { data } = error.response;
      if (data) {
        return Promise.reject(data);
      }
    }

    return Promise.reject(error);
  }
);

// Request Interceptor
apiClient.interceptors.request.use(
  (config) => {
    if (config.url === API_ENDPOINTS.AUTH.REFRESH) {
      return config;
    }

    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default apiClient;
