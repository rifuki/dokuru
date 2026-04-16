import axios from "axios";
import { httpApiUrl } from "./api-config";
import { API_ENDPOINTS } from "./endpoints";
import { useAuthStore } from "@/stores/use-auth-store";

const apiClient = axios.create({
  baseURL: httpApiUrl,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
  withCredentials: true,
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
  window.location.href = "/app/login";
}

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
        if (error.response?.data) {
          return Promise.reject(error.response.data);
        }
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
          `${httpApiUrl}${API_ENDPOINTS.AUTH.REFRESH}`,
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

export type ApiErrorDetails = {
  code: number;
  message: string;
  details: string | null;
};

export type ApiErrorResponse = {
  success: false;
  error_code?: string;
  message: string;
  details?: string | null;
  timestamp: number;
};

export const isApiErrorResponse = (error: unknown): error is ApiErrorResponse => {
  return (
    typeof error === "object" &&
    error !== null &&
    "success" in error &&
    error.success === false &&
    "message" in error &&
    typeof (error as ApiErrorResponse).message === "string"
  );
};

export default apiClient;
