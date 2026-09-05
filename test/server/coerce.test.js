import { describe, it, expect } from "vitest";
import { toBoolean } from "../../server/utils/coerce.js";

describe("toBoolean", () => {
  it("passes real booleans through", () => {
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean(false)).toBe(false);
  });

  it("maps SQLite integer flags", () => {
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean(0)).toBe(false);
  });

  // This is the case the helper exists for. DynamoDB stores is_admin as
  // "true"/"false", and both `Boolean("false")` and `!"false"` get it wrong.
  it("maps DynamoDB string flags", () => {
    expect(toBoolean("true")).toBe(true);
    expect(toBoolean("false")).toBe(false);
  });

  it("is not fooled by the way plain JS coerces the string \"false\"", () => {
    expect(Boolean("false")).toBe(true); // the bug
    expect(toBoolean("false")).toBe(false); // the fix
  });

  it("ignores case and surrounding whitespace", () => {
    expect(toBoolean("TRUE")).toBe(true);
    expect(toBoolean("  True  ")).toBe(true);
    expect(toBoolean(" FALSE ")).toBe(false);
  });

  it("treats absent values as false", () => {
    expect(toBoolean(undefined)).toBe(false);
    expect(toBoolean(null)).toBe(false);
    expect(toBoolean("")).toBe(false);
  });

  it("defaults unrecognised strings to false rather than granting access", () => {
    expect(toBoolean("maybe")).toBe(false);
    expect(toBoolean("0")).toBe(false);
    expect(toBoolean("no")).toBe(false);
  });

  it("accepts the other common truthy encodings", () => {
    expect(toBoolean("1")).toBe(true);
    expect(toBoolean("yes")).toBe(true);
  });
});
