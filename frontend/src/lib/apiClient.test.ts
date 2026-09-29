import { ApiError, api, setUnauthorizedHandler } from "@/lib/apiClient";
import { apiUrl, fail, http, HttpResponse, ok, server } from "@/test/server";

describe("apiClient", () => {
  it("unwraps data and meta from the envelope and sends query params", async () => {
    let seenUrl = "";
    server.use(
      http.get(apiUrl("/tasks"), ({ request }) => {
        seenUrl = request.url;
        return ok([{ id: 1 }], { total: 1, page: 1, pageSize: 20 });
      }),
    );

    const result = await api.get("/tasks", { status: "todo", q: undefined, page: 1 });

    expect(result).toEqual({ data: [{ id: 1 }], meta: { total: 1, page: 1, pageSize: 20 } });
    const params = new URL(seenUrl).searchParams;
    expect(params.get("status")).toBe("todo");
    expect(params.get("page")).toBe("1");
    expect(params.has("q")).toBe(false);
  });

  it("throws ApiError with code, message and field errors", async () => {
    server.use(
      http.post(apiUrl("/tasks"), () =>
        fail(422, "VALIDATION_ERROR", "Request validation failed", [{ field: "title", message: "Required" }]),
      ),
    );

    const err = await api.post("/tasks", {}).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.fieldErrors).toEqual([{ field: "title", message: "Required" }]);
  });

  it("refreshes the session once on 401 and retries", async () => {
    let calls = 0;
    let refreshes = 0;
    server.use(
      http.get(apiUrl("/tasks"), () => {
        calls += 1;
        return calls === 1 ? fail(401, "UNAUTHORIZED", "Not authenticated") : ok([]);
      }),
      http.post(apiUrl("/auth/refresh"), () => {
        refreshes += 1;
        return ok({ id: 1 });
      }),
    );

    await expect(api.get("/tasks")).resolves.toEqual({ data: [], meta: null });
    expect(calls).toBe(2);
    expect(refreshes).toBe(1);
  });

  it("calls the unauthorized handler when refresh fails", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    server.use(
      http.get(apiUrl("/tasks"), () => fail(401, "UNAUTHORIZED", "Not authenticated")),
      http.post(apiUrl("/auth/refresh"), () => fail(401, "UNAUTHORIZED", "Session expired")),
    );

    await expect(api.get("/tasks")).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    setUnauthorizedHandler(() => {});
  });

  it("does not try to refresh for auth endpoints", async () => {
    const refresh = vi.fn(() => ok(null));
    server.use(
      http.post(apiUrl("/auth/login"), () => fail(401, "INVALID_CREDENTIALS", "Invalid email or password")),
      http.post(apiUrl("/auth/refresh"), refresh),
    );

    await expect(api.post("/auth/login", {}, { skipRefresh: true })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("handles non-JSON error responses", async () => {
    server.use(http.get(apiUrl("/tasks"), () => new HttpResponse("Bad gateway", { status: 502 })));
    await expect(api.get("/tasks")).rejects.toMatchObject({ status: 502, code: "HTTP_ERROR" });
  });
});
