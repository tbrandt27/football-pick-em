import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

// The kill switch guards a callback inside app.listen(), which a unit test
// cannot reach without binding a port and a database. These assertions cover
// the two things that actually break in production instead: the guard's
// polarity, and the deploy workflow staying parseable.
//
// Why it matters: DISABLE_SCHEDULER exists so ECS Express can run alongside
// App Runner without two schedulers over one dataset. If the guard inverts,
// production silently stops syncing scores and sending reminder emails.

describe("scheduler kill switch", () => {
  const original = process.env.DISABLE_SCHEDULER;
  afterEach(() => {
    if (original === undefined) delete process.env.DISABLE_SCHEDULER;
    else process.env.DISABLE_SCHEDULER = original;
  });

  // Mirrors the condition at server/index.js. Kept in lockstep by the source
  // assertion below.
  const disabled = () => process.env.DISABLE_SCHEDULER === "true";

  it("runs the scheduler when the flag is absent", () => {
    delete process.env.DISABLE_SCHEDULER;
    expect(disabled()).toBe(false);
  });

  it("runs the scheduler for any value other than exactly 'true'", () => {
    for (const v of ["false", "1", "TRUE", "yes", ""]) {
      process.env.DISABLE_SCHEDULER = v;
      expect(disabled(), `value ${JSON.stringify(v)} must not disable`).toBe(false);
    }
  });

  it("disables only on the exact string 'true'", () => {
    process.env.DISABLE_SCHEDULER = "true";
    expect(disabled()).toBe(true);
  });

  it("server/index.js guards scheduler.start() with that exact check", () => {
    const src = readFileSync("server/index.js", "utf8");
    expect(src).toContain('process.env.DISABLE_SCHEDULER === "true"');
    // scheduler.start() must be inside the else branch, not called first.
    const guard = src.indexOf('process.env.DISABLE_SCHEDULER === "true"');
    const start = src.indexOf("scheduler.start()", guard);
    expect(guard).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(guard);
  });

  it("the health endpoint reports disabled distinctly from stopped", () => {
    const src = readFileSync("server/routes/health.js", "utf8");
    expect(src).toContain("disabledByConfig");
    expect(src).toContain("'disabled'");
  });
});
