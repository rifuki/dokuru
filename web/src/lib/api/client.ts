import axios, { AxiosError } from 'axios';
import { API_URL } from '@/lib/env';
import { HttpError } from './types';
import type { ApiSuccess, ApiError } from './types';

export { HttpError } from './types';
export type { ApiSuccess, ApiError, ApiResponse } from './types';

export const client = axios.create({
  baseURL: API_URL,
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
      const res = await client.get<ApiSuccess<T>>(path, { params: filtered });
      return res.data.data as T;
    } catch (err) {
      throw toHttpError(err);
    }
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    try {
      const res = await client.post<ApiSuccess<T>>(path, body);
      return res.data.data as T;
    } catch (err) {
      throw toHttpError(err);
    }
  },

  async delete<T = void>(path: string): Promise<T> {
    try {
      const res = await client.delete<ApiSuccess<T>>(path);
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
