import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiSuccess } from "@/lib/api/types";
import type {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  User,
} from "@/features/auth/types/auth-types";

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiSuccess<AuthResponse>>(
      API_ENDPOINTS.AUTH.LOGIN,
      credentials
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Login failed: No data received");
    }

    return data;
  },

  register: async (userData: RegisterCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiSuccess<AuthResponse>>(
      API_ENDPOINTS.AUTH.REGISTER,
      userData
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Registration failed: No data received");
    }

    return data;
  },

  refreshToken: (() => {
    let inflight: Promise<string> | null = null;

    return (): Promise<string> => {
      if (!inflight) {
        inflight = apiClient
          .post<ApiSuccess<{ access_token: string }>>(
            API_ENDPOINTS.AUTH.REFRESH,
            {},
            { withCredentials: true }
          )
          .then((response) => {
            const data = response.data.data;
            if (!data?.access_token) throw new Error("Token refresh failed");
            return data.access_token;
          })
          .finally(() => {
            inflight = null;
          });
      }
      return inflight;
    };
  })(),

  logout: async (): Promise<void> => {
    await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT, {}, { withCredentials: true });
  },

  getMe: async (): Promise<User> => {
    const response = await apiClient.get<ApiSuccess<User>>(
      API_ENDPOINTS.AUTH.ME
    );

    const data = response.data.data;
    if (!data) {
      throw new Error("Failed to get user info");
    }

    return data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiClient.post(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  getSessions: async (): Promise<{ id: string; device: string; location: string; ip: string; created_at: string; is_current: boolean }[]> => {
    const response = await apiClient.get<ApiSuccess<{ id: string; device: string; location: string; ip: string; created_at: string; is_current: boolean }[]>>(
      API_ENDPOINTS.AUTH.SESSIONS
    );
    return response.data.data || [];
  },

  revokeSession: async (sessionId: string): Promise<void> => {
    await apiClient.delete(`${API_ENDPOINTS.AUTH.SESSIONS}/${sessionId}`);
  },
};
