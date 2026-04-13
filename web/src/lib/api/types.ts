/**
 * HTTP response envelope — mirrors the Rust backend exactly.
 *
 * Success  → { success: true, data: T }
 * Error    → { success: false, message: string }
 */

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

/** Thrown by apiClient when the server returns success=false or a network error. */
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public envelope?: ApiError,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
