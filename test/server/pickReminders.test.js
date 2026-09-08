import { describe, it, expect, vi } from "vitest";
import { shouldRemind, REMINDER_HOUR } from "../../server/services/pickReminders.js";
import { zonedParts, isValidTimeZone, localHour, LEAGUE_TIMEZONE } from "../../server/utils/timezone.js";

vi.mock("../../server/models/database.js", () => ({
  default: { provider: {}, getType: () => "sqlite" },
}));

/**
 * 6am Eastern on 2026-09-13. Chosen because it is also 3am Pacific and
 * 11am UTC, so the same instant is "reminder time" for exactly one of them.
 */
const SIX_AM_ET = new Date("2026-09-13T10:00:00Z");

describe("timezone helpers", () => {
  it("reads the calendar day in the requested zone, not the server's", () => {
    // A Sunday 8pm ET kickoff is already Monday in UTC. The old scheduler read
    // server-local time here and disagreed with its own ET hour check.
    const kickoff = new Date("2025-09-08T00:00:00Z");
    const et = zonedParts(kickoff, LEAGUE_TIMEZONE);

    expect(et.weekday).toBe(0);        // Sunday in ET
    expect(et.day).toBe(7);
    expect(et.hour).toBe(20);
    expect(et.dateKey).toBe("2025-09-07");
  });

  it("handles the DST boundary", () => {
    // 2026-03-08 02:30 ET does not exist; 06:30Z is 01:30 EST.
    expect(zonedParts(new Date("2026-03-08T06:30:00Z"), LEAGUE_TIMEZONE).hour).toBe(1);
    // After the switch, 07:30Z is 03:30 EDT.
    expect(zonedParts(new Date("2026-03-08T07:30:00Z"), LEAGUE_TIMEZONE).hour).toBe(3);
  });

  it("reports midnight as hour 0, not 24", () => {
    expect(zonedParts(new Date("2026-09-13T04:00:00Z"), LEAGUE_TIMEZONE).hour).toBe(0);
  });

  it("validates IANA identifiers", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it("falls back to the league zone for an unusable value", () => {
    expect(localHour("America/Los_Angeles", SIX_AM_ET)).toBe(3);
    expect(localHour("nonsense", SIX_AM_ET)).toBe(REMINDER_HOUR);
    expect(localHour(null, SIX_AM_ET)).toBe(REMINDER_HOUR);
  });
});

describe("shouldRemind", () => {
  const base = { id: "u1", email: "a@b.c", disable_emails: false, timezone: "America/New_York" };

  it("sends at 6am in the user's own timezone", () => {
    expect(shouldRemind(base, SIX_AM_ET).send).toBe(true);
  });

  it("does not send at other hours", () => {
    const nineAmEt = new Date("2026-09-13T13:00:00Z");
    expect(shouldRemind(base, nineAmEt)).toEqual({ send: false, reason: "not 6am locally" });
  });

  it("sends to a Pacific user three hours later, not at 6am Eastern", () => {
    const pacific = { ...base, timezone: "America/Los_Angeles" };
    expect(shouldRemind(pacific, SIX_AM_ET).send).toBe(false);
    // 6am PT == 13:00Z
    expect(shouldRemind(pacific, new Date("2026-09-13T13:00:00Z")).send).toBe(true);
  });

  it("respects the opt-out", () => {
    expect(shouldRemind({ ...base, disable_emails: true }, SIX_AM_ET))
      .toEqual({ send: false, reason: "opted out" });
  });

  it("respects the opt-out when stored as the DynamoDB string", () => {
    // DynamoDB persists booleans as "true"/"false", and 'false' is truthy.
    expect(shouldRemind({ ...base, disable_emails: "true" }, SIX_AM_ET).send).toBe(false);
    expect(shouldRemind({ ...base, disable_emails: "false" }, SIX_AM_ET).send).toBe(true);
  });

  it("skips a user with no email address", () => {
    expect(shouldRemind({ ...base, email: null }, SIX_AM_ET))
      .toEqual({ send: false, reason: "no email" });
  });

  it("treats a missing timezone as the league default", () => {
    expect(shouldRemind({ ...base, timezone: null }, SIX_AM_ET).send).toBe(true);
  });

  it("treats an invalid timezone as the league default rather than throwing", () => {
    expect(() => shouldRemind({ ...base, timezone: "Not/AZone" }, SIX_AM_ET)).not.toThrow();
    expect(shouldRemind({ ...base, timezone: "Not/AZone" }, SIX_AM_ET).send).toBe(true);
  });
});
