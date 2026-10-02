import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/apiClient";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (4xx) won't succeed on retry.
        retry: (count, error) =>
          !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  });
}
