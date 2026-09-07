import { describe, it, expect } from "vitest";
import {
  apiLimiter,
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  API_LIMIT,
  LOGIN_LIMIT,
  REGISTER_LIMIT,
  PASSWORD_RESET_LIMIT,
  BASE_LIMIT,
} from "../../server/middleware/rateLimit.js";

/**
 * These assert the configuration rather than the counting behaviour --
 * express-rate-limit owns the algorithm. What matters here is that the limits
 * are the intended shape, since a mis-set flag fails silently: a limiter that
 * skips successful requests on registration, for example, would not restrain
 * the abuse that actually matters (creating many accounts successfully).
 */
// express-rate-limit v8 does not expose .options on the middleware it
// returns, so the settings are exported as constants and asserted directly.

describe("limiter configuration", () => {
  it("exports four distinct limiters", () => {
    const all = [apiLimiter, loginLimiter, registerLimiter, passwordResetLimiter];
    expect(new Set(all).size).toBe(4);
    all.forEach((l) => expect(typeof l).toBe("function"));
  });

  it("keeps login and registration on separate budgets", () => {
    // A shared budget means a login brute-force also blocks legitimate
    // sign-ups from the same address -- behind one office NAT that is a
    // self-inflicted outage.
    expect(loginLimiter).not.toBe(registerLimiter);
  });

  it("counts only failed logins", () => {
    expect(LOGIN_LIMIT.skipSuccessfulRequests).toBe(true);
  });

  it("counts every registration, not just failures", () => {
    // The abuse is successful account creation, which skipSuccessfulRequests
    // would ignore entirely.
    expect(REGISTER_LIMIT.skipSuccessfulRequests).toBeFalsy();
  });

  it("counts every password-reset request", () => {
    // /forgot-password returns the same response whether or not the account
    // exists, so there is no failure to count -- and an uncounted endpoint is
    // an email-bombing primitive.
    expect(PASSWORD_RESET_LIMIT.skipSuccessfulRequests).toBeFalsy();
  });

  it("makes the reset limiter the strictest", () => {
    expect(PASSWORD_RESET_LIMIT.limit).toBeLessThan(LOGIN_LIMIT.limit);
    expect(LOGIN_LIMIT.limit).toBeLessThan(API_LIMIT.limit);
  });

  it("uses windows proportional to the sensitivity of each endpoint", () => {
    expect(API_LIMIT.windowMs).toBe(60 * 1000);
    expect(LOGIN_LIMIT.windowMs).toBe(15 * 60 * 1000);
    expect(REGISTER_LIMIT.windowMs).toBe(60 * 60 * 1000);
    expect(PASSWORD_RESET_LIMIT.windowMs).toBe(60 * 60 * 1000);
  });

  it("emits standard RateLimit headers and not the legacy X-RateLimit set", () => {
    expect(BASE_LIMIT.standardHeaders).toBe("draft-7");
    expect(BASE_LIMIT.legacyHeaders).toBe(false);
  });

  it("leaves the /api budget high enough for a normal page load", () => {
    // The weekly pick view issues a burst of reads on mount; a tight global
    // limit would break the app rather than protect it.
    expect(API_LIMIT.limit).toBeGreaterThanOrEqual(200);
  });
});
