import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { ToastProvider } from "@/components/ui/Toast";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

interface Options {
  path?: string;
  routes?: RouteObject[];
  queryClient?: QueryClient;
}

/** Render a component inside the app's providers and a memory router. */
export function renderWithProviders(ui: ReactElement, { path = "/", routes = [], queryClient }: Options = {}) {
  const client = queryClient ?? createTestQueryClient();
  // `path` may carry a query string (e.g. "/reset-password?token=x"); routes match on the pathname only.
  const router = createMemoryRouter([{ path: path.split("?")[0], element: ui }, ...routes], {
    initialEntries: [path],
  });
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, user, router, queryClient: client };
}
