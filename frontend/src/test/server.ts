import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";


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

/** Defaults every test gets (individual tests override with server.use). */
const defaultHandlers = [
  // The task edit form loads the checklist; most tests don't care about it.
  http.get(apiUrl("/tasks/:id/subtasks"), () => ok([])),
  // Tag suggestions/filters and the settings' calendar feed section.
  http.get(apiUrl("/tags"), () => ok([])),
  http.get(apiUrl("/calendar-feed"), () => ok({ enabled: false, createdAt: null })),
];

export const server = setupServer(...defaultHandlers);
