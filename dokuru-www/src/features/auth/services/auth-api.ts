/**
 * Auth API Services
 */

import apiClient from "@/lib/api/axios-instance";
import { API_ENDPOINTS } from "@/lib/api/endpoints";
import type {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  User,
} from "../types";

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.AUTH.LOGIN,
      credentials
    );
    return response.data.data;
  },

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.AUTH.REGISTER,
      credentials
    );
    return response.data.data;
  },

  async logout(): Promise<void> {
    await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
  },

  async getMe(): Promise<User> {
    const response = await apiClient.get(API_ENDPOINTS.AUTH.ME);
    return response.data.data;
  },

  async refreshToken(): Promise<string> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REFRESH);
    return response.data.data.access_token;
  },
};
