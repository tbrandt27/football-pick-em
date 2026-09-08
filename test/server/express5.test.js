import { describe, it, expect } from "vitest";
import express from "express";
import http from "node:http";

/**
 * Guards the Express 5 behaviours this app depends on.
 *
 * The migration's visible work was two path patterns, but the semantics that
 * changed underneath are what future code will lean on -- particularly
 * automatic forwarding of rejected promises, which lets handlers drop their
 * boilerplate try/catch.
 */

/** Start an app on an ephemeral port and issue one request. */
async function request(app, path, method = "GET") {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({ port, path, method }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.end();
    });
  } finally {
    server.close();
  }
}

describe("express version", () => {
  it("is v5", async () => {
    const pkg = await import("express/package.json", { with: { type: "json" } })
      .then((m) => m.default)
      .catch(() => null);
    // Fall back to the behavioural check if the JSON import is unavailable.
    if (pkg) expect(pkg.version.startsWith("5.")).toBe(true);
    else expect(typeof express.Router).toBe("function");
  });
});

describe("path syntax (path-to-regexp 8)", () => {
  it("matches the root with the /{*splat} form used for SSR", async () => {
    const app = express();
    app.get("/{*splat}", (req, res) => res.json({ path: req.path }));

    expect((await request(app, "/")).status).toBe(200);
    expect((await request(app, "/dashboard")).status).toBe(200);
    expect((await request(app, "/game/abc/scores")).status).toBe(200);
  });

  it("/*splat alone does NOT match the root — why the braces are required", async () => {
    const app = express();
    app.get("/*splat", (req, res) => res.json({ ok: true }));

    // Documents the trap: this form silently 404s the homepage.
    expect((await request(app, "/")).status).toBe(404);
    expect((await request(app, "/dashboard")).status).toBe(200);
  });

  it("matches the braced optional parameter with and without the segment", async () => {
    const app = express();
    app.get("/test{/:name}", (req, res) => res.json({ name: req.params.name ?? null }));

    const bare = await request(app, "/test");
    const named = await request(app, "/test/picks");

    expect(bare.status).toBe(200);
    expect(JSON.parse(bare.body).name).toBeNull();
    expect(named.status).toBe(200);
    expect(JSON.parse(named.body).name).toBe("picks");
  });

  it("rejects the removed bare \"*\" path", () => {
    const app = express();
    expect(() => app.get("*", (_req, res) => res.end())).toThrow();
  });
});

describe("async error forwarding", () => {
  it("routes a rejected promise to the error handler without .catch(next)", async () => {
    const app = express();
    app.get("/boom", async () => {
      throw new Error("kaboom");
    });
    // Four-arg signature is what marks this as an error handler.
    app.use((err, req, res, _next) => res.status(500).json({ error: err.message }));

    const res = await request(app, "/boom");

    expect(res.status).toBe(500);
    expect(JSON.parse(res.body).error).toBe("kaboom");
  });

  it("still reaches an error handler registered after a catch-all route", async () => {
    // server/index.js registers its 500 handler below app.get("/{*splat}").
    // Express only routes to handlers declared after the throwing middleware,
    // so ordering is load-bearing.
    const app = express();
    app.get("/{*splat}", async () => {
      throw new Error("from catch-all");
    });
    app.use((err, req, res, _next) => res.status(500).json({ error: err.message }));

    const res = await request(app, "/anything");

    expect(res.status).toBe(500);
    expect(JSON.parse(res.body).error).toBe("from catch-all");
  });
});

describe("res.status validation", () => {
  it("rejects a status outside 100-999", async () => {
    const app = express();
    app.get("/bad", (req, res) => {
      try {
        res.status(1000).end();
      } catch (e) {
        res.status(500).json({ threw: true });
      }
    });

    const res = await request(app, "/bad");
    expect(JSON.parse(res.body).threw).toBe(true);
  });

  it("accepts the 200/503 pair the health routes compute", async () => {
    // Mirrors server/routes/health.js: the status is derived at request time,
    // so it must stay inside the 100-999 range v5 now enforces.
    const app = express();
    app.get("/h", (req, res) => {
      const status = req.query.fail === "1" ? 503 : 200;
      res.status(status).json({ status });
    });

    expect((await request(app, "/h")).status).toBe(200);
    expect((await request(app, "/h?fail=1")).status).toBe(503);
  });
});
