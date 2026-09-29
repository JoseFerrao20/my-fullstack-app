import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/router";
import { ToastProvider } from "@/components/ui/Toast";
import { meKey } from "@/features/auth/hooks";
import { setUnauthorizedHandler } from "@/lib/apiClient";
import { createQueryClient } from "@/lib/queryClient";

export function App() {
  const [queryClient] = useState(() => {
    const client = createQueryClient();
    // Session is gone and couldn't be refreshed: RequireAuth will redirect to /login.
    setUnauthorizedHandler(() => client.setQueryData(meKey, null));
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
