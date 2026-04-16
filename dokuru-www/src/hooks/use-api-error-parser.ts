import { useMemo } from "react";

import axios from "axios";

import {
  isApiError,
  isNetworkError,
  getErrorCategory,
  type ApiError,
} from "@/lib/api/types";

interface ParsedErrorOptions {
  appErrorMessageOverride?: (error: ApiError) => string | undefined;
  defaultMessage?: string;
}

export interface ParsedError {
  message: string;
  type: "app" | "network" | "axios" | "unknown";
  // ApiError fields
  code: number;
  errorCode: string | null;
  errorCategory: string;
  details: string | null;
  timestamp: number | null;
  // Type checks
  isNetworkError: boolean;
  isAppError: boolean;
  isAxiosError: boolean;
  isUnknownError: boolean;
  // Helpers
  hasErrorCode: (code: string) => boolean;
  originalError: unknown;
}

export function useApiErrorParser(
  error: unknown,
  options?: ParsedErrorOptions
): ParsedError | null {
  // Destructure options to avoid object reference issues
  const { defaultMessage: defaultMsgOverride, appErrorMessageOverride } = options ?? {};
  
  return useMemo(() => {
    // Default values
    const defaultMessage = defaultMsgOverride ?? "An unexpected error occurred";

    let message = defaultMessage;
    let type: ParsedError["type"] = "unknown";
    let code = 500;
    let errorCode: string | null = null;
    let details: string | null = null;
    let timestamp: number | null = null;

    // Check for network errors first
    if (isNetworkError(error)) {
      message =
        "We couldn't connect to the server. Please check your connection and try again.";
      type = "network";
      code = 0;
    }
    // Check for API application errors (Dokuru ApiError)
    else if (isApiError(error)) {
      type = "app";
      code = error.code;
      errorCode = error.error_code;
      details = error.details;
      timestamp = error.timestamp;

      const overrideMessage = appErrorMessageOverride?.(error);

      if (overrideMessage) {
        message = overrideMessage;
      } else {
        message = error.message;
      }
    }
    // Check for axios errors
    else if (axios.isAxiosError(error)) {
      message = error.response?.data?.message || error.message;
      type = "axios";
      code = error.response?.status ?? 500;
    }
    // Generic error
    else if (error instanceof Error) {
      message = error.message;
      type = "unknown";
    }

    return {
      message,
      type,
      code,
      errorCode,
      errorCategory: getErrorCategory(errorCode),
      details,
      timestamp,
      isNetworkError: type === "network",
      isAppError: type === "app",
      isAxiosError: type === "axios",
      isUnknownError: type === "unknown",
      hasErrorCode: (checkCode: string) => errorCode === checkCode,
      originalError: error,
    };
  }, [error, defaultMsgOverride, appErrorMessageOverride]);
}
