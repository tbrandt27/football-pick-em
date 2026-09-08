import { describe, it, expect, vi, beforeEach } from "vitest";

// The service reads db.provider in its constructor, so the database module is
// stubbed before import. _dynamoScan/_dynamoGet are driven per test.
const _dynamoScan = vi.fn();
const _dynamoGet = vi.fn();
const _getByEmailGSI = vi.fn();
const _dynamoQueryGSI = vi.fn();

vi.mock("../../server/models/database.js", () => ({
  default: { provider: { _dynamoScan, _dynamoGet, _getByEmailGSI, _dynamoQueryGSI } },
}));

const { default: DynamoDBUserService } = await import(
  "../../server/services/database/dynamodb/DynamoDBUserService.js"
);

const svc = () => new DynamoDBUserService();

beforeEach(() => {
  vi.clearAllMocks();
  _dynamoGet.mockResolvedValue({ Item: undefined });
});

/**
 * The regression this guards: production stored is_admin as a mix of
 * BOOL true/false and the strings "true"/"false". `'false'` is truthy, so the
 * admin Users list rendered an "Admin" badge for every user and offered
 * "Remove Admin" on all of them.
 */
describe("user normalisation across is_admin encodings", () => {
  it("converts the string \"false\" to boolean false", async () => {
    _dynamoScan.mockResolvedValue({
      Items: [{ id: "u1", email: "a@b.c", is_admin: "false", email_verified: "false" }],
    });

    const [user] = await svc().getAllUsers();

    expect(user.is_admin).toBe(false);
    expect(user.email_verified).toBe(false);
  });

  it("converts the string \"true\" to boolean true", async () => {
    _dynamoScan.mockResolvedValue({
      Items: [{ id: "u1", is_admin: "true", email_verified: "true" }],
    });

    const [user] = await svc().getAllUsers();

    expect(user.is_admin).toBe(true);
    expect(user.email_verified).toBe(true);
  });

  it("passes native booleans through unchanged", async () => {
    _dynamoScan.mockResolvedValue({
      Items: [
        { id: "u1", is_admin: true, created_at: "2026-01-02" },
        { id: "u2", is_admin: false, created_at: "2026-01-01" },
      ],
    });

    const users = await svc().getAllUsers();

    expect(users.map((u) => u.is_admin)).toEqual([true, false]);
  });

  it("normalises a mixed-encoding table uniformly", async () => {
    // Exactly the shape production was in: 2x BOOL false, 1x S "false",
    // 1x BOOL true. Only one user is an admin.
    _dynamoScan.mockResolvedValue({
      Items: [
        { id: "u1", is_admin: false },
        { id: "u2", is_admin: "false" },
        { id: "u3", is_admin: true },
        { id: "u4", is_admin: false },
      ],
    });

    const users = await svc().getAllUsers();
    const admins = users.filter((u) => u.is_admin);

    expect(users.every((u) => typeof u.is_admin === "boolean")).toBe(true);
    expect(admins).toHaveLength(1);
    expect(admins[0].id).toBe("u3");
  });

  it("treats a missing flag as false rather than undefined", async () => {
    _dynamoScan.mockResolvedValue({ Items: [{ id: "u1", email: "a@b.c" }] });

    const [user] = await svc().getAllUsers();

    expect(user.is_admin).toBe(false);
    expect(user.email_verified).toBe(false);
  });

  it("normalises getUserById", async () => {
    _dynamoGet.mockResolvedValue({ Item: { id: "u1", is_admin: "false" } });

    const user = await svc().getUserById("u1");

    expect(user.is_admin).toBe(false);
  });

  it("normalises getUserByEmail via the GSI path", async () => {
    _getByEmailGSI.mockResolvedValue({ id: "u1", is_admin: "true" });

    const user = await svc().getUserByEmail("a@b.c");

    expect(user.is_admin).toBe(true);
  });

  it("normalises getFirstAdminUser via the GSI path", async () => {
    _dynamoQueryGSI.mockResolvedValue({ Items: [{ id: "u3", is_admin: "true" }] });

    const user = await svc().getFirstAdminUser();

    expect(user.is_admin).toBe(true);
    expect(user.id).toBe("u3");
  });

  it("returns null, not a normalised empty object, when there is no user", async () => {
    _dynamoGet.mockResolvedValue({ Item: undefined });

    expect(await svc().getUserById("nope")).toBeNull();
  });

  it("preserves every other field", async () => {
    _dynamoScan.mockResolvedValue({
      Items: [{ id: "u1", email: "a@b.c", first_name: "Ada", is_admin: "false" }],
    });

    const [user] = await svc().getAllUsers();

    expect(user).toMatchObject({ id: "u1", email: "a@b.c", first_name: "Ada" });
  });
});
