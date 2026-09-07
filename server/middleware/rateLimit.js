import rateLimit from "express-rate-limit";

/**
 * Rate limiters.
 *
 * The app previously had none, so /login, /register and /forgot-password
 * accepted unlimited attempts. Registration and login also do bcrypt work at
 * cost 12, which makes /login a cheap CPU-exhaustion vector as well as a
 * credential-stuffing target.
 *
 * NOTE ON CLIENT IPs: these key on req.ip, which behind App Runner or an ALB
 * is the proxy's address unless Express is told how many hops to trust. See
 * the `trust proxy` setting in server/index.js -- without it every request
 * shares one key and a single caller can lock out everyone.
 */

/** Shared JSON error shape, so clients get something parseable rather than HTML. */
const handler = (req, res) => {
  res.status(429).json({
    error: "Too many requests. Please try again later.",
    retryAfter: res.getHeader("Retry-After"),
  });
};

/** Settings every limiter shares. Exported so tests can assert them. */
export const BASE_LIMIT = {
  standardHeaders: "draft-7", // RateLimit / RateLimit-Policy
  legacyHeaders: false,
};

const base = { ...BASE_LIMIT, handler };

/**
 * Everything under /api. Loose enough that normal use never notices --
 * the weekly pick view issues a burst of reads on load.
 */
export const API_LIMIT = { windowMs: 60 * 1000, limit: 300 };
export const apiLimiter = rateLimit({ ...base, ...API_LIMIT });

/**
 * Login only.
 *
 * Counts failures only, so someone signing in normally is never affected
 * while credential-stuffing still accumulates.
 *
 * Deliberately separate from the registration limiter: a shared budget means a
 * login brute-force also blocks legitimate sign-ups from the same address, and
 * behind one office NAT that is a self-inflicted outage.
 */
export const LOGIN_LIMIT = {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
};
export const loginLimiter = rateLimit({ ...base, ...LOGIN_LIMIT });

/**
 * Account creation (register and register-invite).
 *
 * Counts every request, not just failures -- the abuse here is creating many
 * accounts successfully, which is exactly what skipSuccessfulRequests would
 * ignore. Sized so a household or office sharing one IP can still sign up.
 */
export const REGISTER_LIMIT = { windowMs: 60 * 60 * 1000, limit: 20 };
export const registerLimiter = rateLimit({ ...base, ...REGISTER_LIMIT });

/**
 * Password reset request and redemption.
 *
 * Tighter, and counts successes too: /forgot-password deliberately returns the
 * same response whether or not the account exists, so there is no failure to
 * count, and an unlimited endpoint is an email-bombing primitive.
 */
export const PASSWORD_RESET_LIMIT = { windowMs: 60 * 60 * 1000, limit: 5 };
export const passwordResetLimiter = rateLimit({ ...base, ...PASSWORD_RESET_LIMIT });
