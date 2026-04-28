import { apiClient, API_ENDPOINTS } from "@/lib/api";
import type { ApiSuccess } from "@/lib/api/types";
import type {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  User,
} from "@/features/auth/types/auth-types";

type Session = {
  id: string;
  device: string;
  device_type?: string | null;
  location: string;
  ip: string;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
};

function trimLoginCredentials(
  credentials: LoginCredentials
): LoginCredentials {
  return {
    username: credentials.username.trim(),
    password: credentials.password.trim(),
  };
}

function trimRegisterCredentials(
  userData: RegisterCredentials
): RegisterCredentials {
  return {
    email: userData.email.trim(),
    username: userData.username.trim(),
    password: userData.password.trim(),
    name: userData.name.trim(),
  };
}

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiSuccess<AuthResponse>>(
      API_ENDPOINTS.AUTH.LOGIN,
      trimLoginCredentials(credentials)
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
      trimRegisterCredentials(userData)
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
      current_password: currentPassword.trim(),
      new_password: newPassword.trim(),
    });
  },

  getSessions: async (): Promise<Session[]> => {
    const response = await apiClient.get<ApiSuccess<Session[]>>(
      API_ENDPOINTS.AUTH.SESSIONS
    );
    return response.data.data || [];
  },

  revokeSession: async (sessionId: string): Promise<void> => {
    await apiClient.delete(`${API_ENDPOINTS.AUTH.SESSIONS}/${sessionId}`);
  },
};
