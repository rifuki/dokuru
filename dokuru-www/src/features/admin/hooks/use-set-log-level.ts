import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminService } from "@/lib/api";

import type { LogLevelRequest } from "../types/admin-types";

export function useSetLogLevel() {
  return useMutation({
    mutationFn: (data: LogLevelRequest) => adminService.setLogLevel(data.level),
    onSuccess: () => {
      toast.success("Log level updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update log level", {
        description: error.message,
      });
    },
  });
}
