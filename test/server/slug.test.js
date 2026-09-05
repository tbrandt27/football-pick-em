import { describe, it, expect } from "vitest";
import { createGameSlug as serverSlug } from "../../server/utils/slug.js";
import { createGameSlug as clientSlug } from "../../src/lib/slug.ts";

const CASES = [
  ["Sunday Funday", "sunday-funday"],
  ["The 2026 Office Pool", "the-2026-office-pool"],
  ["Tommy's League!", "tommys-league"],
  ["  leading and trailing  ", "leading-and-trailing"],
  ["Multiple   Spaces", "multiple-spaces"],
  ["already-hyphenated", "already-hyphenated"],
  ["Double--Hyphen", "double-hyphen"],
  ["--edges--", "edges"],
  ["MiXeD CaSe", "mixed-case"],
  ["Survivor 🏈 Pool", "survivor-pool"],
  ["A/B & C", "ab-c"],
];

describe("createGameSlug", () => {
  it.each(CASES)("slugifies %j to %j", (input, expected) => {
    expect(serverSlug(input)).toBe(expected);
  });

  // The browser builds the slug that goes into the URL and the server resolves
  // it back to a game. If these two ever diverge, every game link 404s.
  it.each(CASES)("client and server agree on %j", (input) => {
    expect(clientSlug(input)).toBe(serverSlug(input));
  });

  it("is idempotent", () => {
    for (const [input] of CASES) {
      const once = serverSlug(input);
      expect(serverSlug(once)).toBe(once);
    }
  });

  it("returns an empty string when nothing survives sanitisation", () => {
    expect(serverSlug("!!!")).toBe("");
    expect(serverSlug("   ")).toBe("");
  });

  // Documents a known limitation rather than asserting desired behaviour:
  // distinct names can collide, and getGameBySlug resolves to whichever game
  // the underlying query happens to return first.
  it("collides for names differing only in punctuation", () => {
    expect(serverSlug("Tommy's League")).toBe(serverSlug("Tommys League"));
  });
});
