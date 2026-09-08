import { describe, it, expect, vi, beforeEach } from "vitest";
import { toFlagString, toFlagInt } from "../../server/utils/coerce.js";

const _dynamoPut = vi.fn();
const _dynamoUpdate = vi.fn();
const _dynamoGet = vi.fn();

vi.mock("../../server/models/database.js", () => ({
  default: { provider: { _dynamoPut, _dynamoUpdate, _dynamoGet } },
}));

const { default: DynamoDBUserService } = await import(
  "../../server/services/database/dynamodb/DynamoDBUserService.js"
);

const svc = () => new DynamoDBUserService();

beforeEach(() => {
  vi.clearAllMocks();
  _dynamoGet.mockResolvedValue({ Item: { id: "u1", is_admin: "false" } });
});

describe("flag serialisers", () => {
  it("toFlagString always yields the canonical DynamoDB strings", () => {
    expect(toFlagString(true)).toBe("true");
    expect(toFlagString(false)).toBe("false");
    // Accepts anything a caller might already hold, including the
    // BOOL/string mix that existed in production.
    expect(toFlagString("true")).toBe("true");
    expect(toFlagString("false")).toBe("false");
    expect(toFlagString(1)).toBe("true");
    expect(toFlagString(0)).toBe("false");
    expect(toFlagString(undefined)).toBe("false");
    expect(toFlagString(null)).toBe("false");
  });

  it("toFlagInt always yields SQLite 0/1", () => {
    expect(toFlagInt(true)).toBe(1);
    expect(toFlagInt("true")).toBe(1);
    expect(toFlagInt(false)).toBe(0);
    expect(toFlagInt("false")).toBe(0);
    expect(toFlagInt(undefined)).toBe(0);
  });

  it("never emits a native boolean — a BOOL value is invisible to a String-keyed GSI", () => {
    for (const v of [true, false, "true", "false", 1, 0, undefined]) {
      expect(typeof toFlagString(v)).toBe("string");
    }
  });
});

describe("createUser writes canonical flags", () => {
  it("stores strings, not booleans", async () => {
    await svc().createUser({
      id: "u1", email: "A@B.c", password: "x",
      firstName: "Ada", lastName: "L", isAdmin: true, emailVerified: true,
    });

    const [, item] = _dynamoPut.mock.calls[0];
    expect(item.is_admin).toBe("true");
    expect(item.email_verified).toBe("true");
    expect(typeof item.is_admin).toBe("string");
  });

  it("defaults both flags to the string \"false\"", async () => {
    await svc().createUser({
      id: "u1", email: "a@b.c", password: "x", firstName: "Ada", lastName: "L",
    });

    const [, item] = _dynamoPut.mock.calls[0];
    expect(item.is_admin).toBe("false");
    expect(item.email_verified).toBe("false");
  });
});

describe("updateAdminStatus / updateEmailVerified", () => {
  it("writes canonical strings for either input form", async () => {
    await svc().updateAdminStatus("u1", true);
    expect(_dynamoUpdate.mock.calls[0][2]).toEqual({ is_admin: "true" });

    await svc().updateAdminStatus("u1", "false");
    expect(_dynamoUpdate.mock.calls[1][2]).toEqual({ is_admin: "false" });

    await svc().updateEmailVerified("u1", 1);
    expect(_dynamoUpdate.mock.calls[2][2]).toEqual({ email_verified: "true" });
  });
});

/**
 * routes/auth.js redeems an admin invitation with
 * updateUserDynamic(id, { isAdmin: true }). Neither provider handled that
 * field, so updateItem stayed empty and the method threw
 * 'No valid fields to update'. auth.js caught it per-invitation and carried
 * on, so the user was told they had been granted admin while the row was
 * never touched.
 */
describe("updateUserDynamic admin promotion", () => {
  it("promotes to admin when isAdmin is the only field", async () => {
    await svc().updateUserDynamic("u1", { isAdmin: true });

    expect(_dynamoUpdate).toHaveBeenCalledOnce();
    expect(_dynamoUpdate.mock.calls[0][2]).toEqual({ is_admin: "true" });
  });

  it("no longer throws when isAdmin is the only field", async () => {
    await expect(svc().updateUserDynamic("u1", { isAdmin: true })).resolves.toBeDefined();
  });

  it("demotes an admin", async () => {
    await svc().updateUserDynamic("u1", { isAdmin: false });
    expect(_dynamoUpdate.mock.calls[0][2]).toEqual({ is_admin: "false" });
  });

  it("handles emailVerified on its own", async () => {
    await svc().updateUserDynamic("u1", { emailVerified: true });
    expect(_dynamoUpdate.mock.calls[0][2]).toEqual({ email_verified: "true" });
  });

  it("combines flags with profile fields", async () => {
    await svc().updateUserDynamic("u1", { firstName: "Ada", isAdmin: true });
    expect(_dynamoUpdate.mock.calls[0][2]).toEqual({
      first_name: "Ada",
      is_admin: "true",
    });
  });

  it("leaves flags untouched when not supplied", async () => {
    await svc().updateUserDynamic("u1", { firstName: "Ada" });
    const item = _dynamoUpdate.mock.calls[0][2];
    expect(item).not.toHaveProperty("is_admin");
    expect(item).not.toHaveProperty("email_verified");
  });

  it("still rejects an update with no recognised field at all", async () => {
    await expect(svc().updateUserDynamic("u1", { nope: 1 })).rejects.toThrow(
      "No valid fields to update"
    );
  });

  it("returns a normalised user, not a raw item", async () => {
    _dynamoGet.mockResolvedValue({ Item: { id: "u1", is_admin: "true" } });

    const user = await svc().updateUserDynamic("u1", { isAdmin: true });

    expect(user.is_admin).toBe(true);
  });
});
