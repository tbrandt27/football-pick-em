import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// The module reads localStorage in its constructor, so it is imported fresh
// per test via a dynamic import after localStorage has been arranged.
async function freshClient() {
  vi.resetModules();
  const mod = await import("../../src/utils/api");
  return mod.api;
}

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiClient token handling", () => {
  it("picks up an existing token from localStorage on construction", async () => {
    localStorage.setItem("token", "stored-token");
    const api = await freshClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ user: {} }));

    await api.getCurrentUser();

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer stored-token");
  });

  it("sends no Authorization header when there is no token", async () => {
    const api = await freshClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ teams: [] }));

    await api.getTeams();

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("persists a token set at runtime and clears it on null", async () => {
    const api = await freshClient();

    api.setToken("new-token");
    expect(localStorage.getItem("token")).toBe("new-token");

    api.setToken(null);
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("ApiClient response shape", () => {
  it("wraps a successful body as { success: true, data }", async () => {
    const api = await freshClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ teams: [{ id: "t1" }] }));

    const res = await api.getTeams();

    expect(res.success).toBe(true);
    expect(res.data).toEqual({ teams: [{ id: "t1" }] });
  });

  it("surfaces the server's error message on a non-2xx response", async () => {
    const api = await freshClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ error: "Admin access required" }, false, 403)
    );

    const res = await api.getTeams();

    expect(res.success).toBe(false);
    expect(res.error).toBe("Admin access required");
  });

  it("falls back to the status code when the body carries no error field", async () => {
    const api = await freshClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({}, false, 502));

    const res = await api.getTeams();

    expect(res.success).toBe(false);
    expect(res.error).toContain("502");
  });

  it("reports a network failure instead of throwing", async () => {
    const api = await freshClient();
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Failed to fetch"));

    const res = await api.getTeams();

    expect(res.success).toBe(false);
    expect(res.error).toBe("Failed to fetch");
  });
});

describe("ApiClient request building", () => {
  it("percent-encodes a game slug into the path", async () => {
    const api = await freshClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ game: {} }));

    await api.getGameBySlug("weird slug/with-slash");

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/games/by-slug/weird%20slug%2Fwith-slash");
  });

  it("omits undefined pick filters from the query string", async () => {
    const api = await freshClient();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ picks: [] }));

    await api.getUserPicks({ gameId: "g1", week: undefined, seasonId: "s1" });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("gameId=g1");
    expect(url).toContain("seasonId=s1");
    expect(url).not.toContain("week");
  });
});
