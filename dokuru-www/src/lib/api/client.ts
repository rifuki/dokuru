import axios, { AxiosError } from 'axios';
import { useEnvironmentStore } from '@/stores/environment-store';
import { HttpError } from './types';
import type { ApiSuccess, ApiError } from './types';

export { HttpError } from './types';
export type { ApiSuccess, ApiError, ApiResponse } from './types';

function getBaseURL(): string {
  const state = useEnvironmentStore.getState();
  const activeEnv = state.environments.find(e => e.id === state.activeEnvironmentId);
  return activeEnv ? `${activeEnv.url}/api/v1` : '/api/v1';
}

function resolvePath(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getBaseURL()}${cleanPath}`;
}

export const client = axios.create({
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Thin wrapper around `client` that:
 * - Unwraps the envelope so callers get `T` directly
 * - Throws `HttpError` on success=false or network errors
 */

export const apiClient = {
  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const filtered = params
      ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
      : undefined;
    try {
      const res = await client.get<ApiSuccess<T>>(resolvePath(path), { params: filtered });
      const data = res.data.data;
      if (data === undefined) throw new HttpError('Empty response from server', res.status);
      return data as T;
    } catch (err) {
      throw toHttpError(err);
    }
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    try {
      const res = await client.post<ApiSuccess<T>>(resolvePath(path), body);
      const data = res.data.data;
      if (data === undefined) throw new HttpError('Empty response from server', res.status);
      return data as T;
    } catch (err) {
      throw toHttpError(err);
    }
  },

  async delete<T = void>(path: string): Promise<T> {
    try {
      const res = await client.delete<ApiSuccess<T>>(resolvePath(path));
      return res.data.data as T;
    } catch (err) {
      throw toHttpError(err);
    }
  },
};

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof AxiosError) {
    const envelope = err.response?.data as ApiError | undefined;
    const message = envelope?.message || err.message || 'Request failed';
    const status = err.response?.status ?? 0;
    return new HttpError(message, status, envelope);
  }
  return new HttpError(String(err), 0);
}
