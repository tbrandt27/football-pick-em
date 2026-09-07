import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

const SECRET = "test-secret-not-a-real-one";

// The middleware pulls the secret from configService and the user from the
// service factory; both are stubbed so these tests exercise only the auth
// decision logic.
const getUserById = vi.fn();
const getUserByEmail = vi.fn();
const getParticipant = vi.fn();

vi.mock("../../server/services/configService.js", () => ({
  default: { getJwtSecret: () => SECRET },
}));

vi.mock("../../server/services/database/DatabaseServiceFactory.js", () => ({
  default: {
    getUserService: () => ({ getUserById, getUserByEmail }),
    getGameService: () => ({ getParticipant }),
  },
}));

const { authenticateToken, requireAdmin, requireGameOwner } = await import(
  "../../server/middleware/auth.js"
);

/** Minimal Express res double that records the status/body it was sent. */
function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

const sign = (payload, opts) => jwt.sign(payload, SECRET, opts);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticateToken", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = mockRes();
    const next = vi.fn();
    await authenticateToken({ headers: {} }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects a malformed Authorization header", async () => {
    const res = mockRes();
    const next = vi.fn();
    await authenticateToken({ headers: { authorization: "Bearer" } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects a token signed with a different secret", async () => {
    const forged = jwt.sign({ userId: "u1" }, "attacker-secret");
    const res = mockRes();
    const next = vi.fn();
    await authenticateToken({ headers: { authorization: `Bearer ${forged}` } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    const expired = sign({ userId: "u1" }, { expiresIn: "-1s" });
    const res = mockRes();
    const next = vi.fn();
    await authenticateToken({ headers: { authorization: `Bearer ${expired}` } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("attaches the user and continues for a valid token", async () => {
    const user = { id: "u1", email: "a@b.c", is_admin: false, email_verified: true };
    getUserById.mockResolvedValue(user);

    const req = { headers: { authorization: `Bearer ${sign({ userId: "u1" })}` } };
    const res = mockRes();
    const next = vi.fn();
    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ id: "u1", email: "a@b.c" });
  });

  it("normalises DynamoDB string flags into real booleans on req.user", async () => {
    // DynamoDB persists these as "true"/"false"; downstream handlers and JSON
    // responses must never see the raw strings.
    getUserById.mockResolvedValue({
      id: "u1",
      email: "a@b.c",
      is_admin: "false",
      email_verified: "true",
    });

    const req = { headers: { authorization: `Bearer ${sign({ userId: "u1" })}` } };
    const next = vi.fn();
    await authenticateToken(req, mockRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user.is_admin).toBe(false);
    expect(req.user.email_verified).toBe(true);
  });

  it("falls back to the email claim when the id lookup misses", async () => {
    const user = { id: "u9", email: "a@b.c", is_admin: false };
    getUserById.mockResolvedValue(null);
    getUserByEmail.mockResolvedValue(user);

    const req = {
      headers: { authorization: `Bearer ${sign({ userId: "stale", email: "a@b.c" })}` },
    };
    const res = mockRes();
    const next = vi.fn();
    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ id: "u9", email: "a@b.c" });
  });

  it("rejects a validly signed token for a user that no longer exists", async () => {
    getUserById.mockResolvedValue(null);
    getUserByEmail.mockResolvedValue(null);

    const req = { headers: { authorization: `Bearer ${sign({ userId: "deleted" })}` } };
    const res = mockRes();
    const next = vi.fn();
    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("requireAdmin", () => {
  it("allows an admin through", async () => {
    const next = vi.fn();
    await requireAdmin({ user: { is_admin: true } }, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a non-admin", async () => {
    const res = mockRes();
    const next = vi.fn();
    await requireAdmin({ user: { is_admin: false } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("rejects when no user is attached", async () => {
    const res = mockRes();
    const next = vi.fn();
    await requireAdmin({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  // Regression guard. is_admin arrives as the string "true"/"false" from
  // DynamoDB and as 0/1 from SQLite. A bare `!req.user.is_admin` check let
  // every authenticated user through on the DynamoDB path, because
  // `!"false"` is false.
  it("rejects the string \"false\" (privilege-escalation regression guard)", async () => {
    const res = mockRes();
    const next = vi.fn();
    await requireAdmin({ user: { is_admin: "false" } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("accepts the string \"true\" from DynamoDB", async () => {
    const next = vi.fn();
    await requireAdmin({ user: { is_admin: "true" } }, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("accepts the integer 1 from SQLite", async () => {
    const next = vi.fn();
    await requireAdmin({ user: { is_admin: 1 } }, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects the integer 0 from SQLite", async () => {
    const res = mockRes();
    const next = vi.fn();
    await requireAdmin({ user: { is_admin: 0 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe("requireGameOwner", () => {
  it("requires a game id", async () => {
    const res = mockRes();
    const next = vi.fn();
    await requireGameOwner({ params: {}, body: {}, user: { id: "u1" } }, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows the game owner", async () => {
    getParticipant.mockResolvedValue({ role: "owner" });
    const next = vi.fn();
    await requireGameOwner(
      { params: { gameId: "g1" }, body: {}, user: { id: "u1" } },
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a plain player", async () => {
    getParticipant.mockResolvedValue({ role: "player" });
    const res = mockRes();
    const next = vi.fn();
    await requireGameOwner(
      { params: { gameId: "g1" }, body: {}, user: { id: "u1" } },
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("rejects a non-participant", async () => {
    getParticipant.mockResolvedValue(null);
    const res = mockRes();
    const next = vi.fn();
    await requireGameOwner(
      { params: { gameId: "g1" }, body: {}, user: { id: "u1" } },
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("lets an admin override ownership", async () => {
    getParticipant.mockResolvedValue(null);
    const next = vi.fn();
    await requireGameOwner(
      { params: { gameId: "g1" }, body: {}, user: { id: "u1", is_admin: true } },
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 500 rather than granting access when the lookup throws", async () => {
    getParticipant.mockRejectedValue(new Error("dynamo down"));
    const res = mockRes();
    const next = vi.fn();
    await requireGameOwner(
      { params: { gameId: "g1" }, body: {}, user: { id: "u1" } },
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });
});
