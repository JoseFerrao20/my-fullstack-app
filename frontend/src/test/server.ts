import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const server = setupServer();

/** Absolute URL for an API path, matching what apiClient requests. */
export const apiUrl = (path: string) => `${window.location.origin}/api${path}`;

export const envelope = <T>(data: T, meta: unknown = null) => ({ data, error: null, meta });

export const errorEnvelope = (code: string, message: string, details: unknown = null) => ({
  data: null,
  error: { code, message, details },
  meta: null,
});

export const ok = <T>(data: T, meta: unknown = null) => HttpResponse.json(envelope(data, meta));

export const fail = (status: number, code: string, message: string, details: unknown = null) =>
  HttpResponse.json(errorEnvelope(code, message, details), { status });

export { http, HttpResponse };
