// API Types

export interface ApiSuccess<T> {
  success: true;
  code: number;
  data: T | null;
  message: string;
  timestamp: number;
}

export type ApiResponse<T> = ApiSuccess<T>;

export interface ApiError {
  success: false;
  code: number;
  error_code: string | null;
  message: string;
  details: string | null;
  timestamp: number;
}

export type ApiErrorResponse = ApiError;

export const isApiError = (error: unknown): error is ApiError => {
  return (
    error != null &&
    typeof error === "object" &&
    (error as ApiError).success === false &&
    typeof (error as ApiError).timestamp === "number" &&
    typeof (error as ApiError).message === "string"
  );
};

export const isApiErrorResponse = isApiError;

export const isNetworkError = (error: unknown): boolean => {
  return error instanceof Error && error.message === "Network Error";
};

export const ErrorCodes = {
  AUTH: {
    INVALID_CREDENTIALS: "AUTH_001",
    EMAIL_EXISTS: "AUTH_002",
    TOKEN_EXPIRED: "AUTH_003",
    TOKEN_INVALID: "AUTH_004",
    UNAUTHORIZED: "AUTH_005",
    FORBIDDEN: "AUTH_006",
    API_KEY_INVALID: "AUTH_007",
  },
  VALIDATION: {
    INVALID_INPUT: "VAL_001",
    MISSING_FIELD: "VAL_002",
    INVALID_FORMAT: "VAL_003",
  },
  GENERIC: {
    NOT_FOUND: "GEN_001",
    INTERNAL: "GEN_002",
    RATE_LIMITED: "GEN_003",
  },
} as const;

export const getErrorCategory = (errorCode: string | null): string => {
  if (!errorCode) return "UNKNOWN";
  if (errorCode.startsWith("AUTH_")) return "AUTH";
  if (errorCode.startsWith("VAL_")) return "VALIDATION";
  if (errorCode.startsWith("GEN_")) return "GENERIC";
  return "UNKNOWN";
};

export const hasErrorCode = (
  error: unknown,
  code: string
): error is ApiError => {
  return isApiError(error) && error.error_code === code;
};
