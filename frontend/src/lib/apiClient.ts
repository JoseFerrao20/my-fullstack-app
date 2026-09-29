/**
 * Thin fetch wrapper for the {data, error, meta} envelope.
 * Auth rides on httpOnly cookies; on a 401 the client refreshes the session once and retries.
 */

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get fieldErrors(): FieldError[] {
    return Array.isArray(this.details) ? (this.details as FieldError[]) : [];
  }
}

export interface ApiResult<T, M = Record<string, unknown> | null> {
  data: T;
  meta: M;
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Skip the refresh-and-retry dance (used by auth endpoints themselves). */
  skipRefresh?: boolean;
}

let onUnauthorized: () => void = () => {};

/** Called when the session can't be refreshed (e.g. redirect to /login). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function send(path: string, { method = "GET", body, query }: RequestOptions) {
  return fetch(buildUrl(path, query), {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  // Share one in-flight refresh between concurrent 401s.
  refreshing ??= send("/auth/refresh", { method: "POST" })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function parse<T, M>(res: Response): Promise<ApiResult<T, M>> {
  let payload: { data?: T; error?: { code: string; message: string; details?: unknown }; meta?: M } | null =
    null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON response (e.g. proxy error page).
  }
  if (!res.ok || payload?.error) {
    const err = payload?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "HTTP_ERROR",
      err?.message ?? `Request failed with status ${res.status}`,
      err?.details,
    );
  }
  return { data: payload?.data as T, meta: (payload?.meta ?? null) as M };
}

export async function request<T, M = Record<string, unknown> | null>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T, M>> {
  let res = await send(path, options);
  if (res.status === 401 && !options.skipRefresh) {
    if (await refreshSession()) {
      res = await send(path, options);
    }
    if (res.status === 401) onUnauthorized();
  }
  return parse<T, M>(res);
}

export const api = {
  get: <T, M = Record<string, unknown> | null>(path: string, query?: Query) =>
    request<T, M>(path, { query }),
  post: <T>(path: string, body?: unknown, opts?: Pick<RequestOptions, "skipRefresh">) =>
    request<T>(path, { method: "POST", body, ...opts }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T = null>(path: string) => request<T>(path, { method: "DELETE" }),
};
