/**
 * Timezone helpers.
 *
 * The scheduler previously mixed two clocks: `isGameDay()` read the *server's*
 * local day while `isActiveGameTime()` derived an Eastern hour. On a UTC host
 * (App Runner, ECS) a Sunday 8pm ET kickoff is already Monday 01:00 UTC, so the
 * two disagreed about what day it was.
 *
 * It also used `new Date(d.toLocaleString('en-US', { timeZone }))`, which
 * round-trips through a localised string and back through the *local* parser.
 * That is implementation-defined and only works by accident. `Intl.DateTimeFormat`
 * with explicit parts is the supported way to read wall-clock values in a zone.
 */

/** The league's reference zone: NFL scheduling is quoted in Eastern time. */
export const LEAGUE_TIMEZONE = "America/New_York";

const partsCache = new Map();

function formatterFor(timeZone) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Reads wall-clock fields for an instant in a specific zone.
 *
 * @param {Date} [date]
 * @param {string} [timeZone]
 * @returns {{year:number, month:number, day:number, hour:number, minute:number, weekday:number, dateKey:string}}
 */
export function zonedParts(date = new Date(), timeZone = LEAGUE_TIMEZONE) {
  const parts = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  // "24" appears at midnight under hour12:false in some engines.
  const hour = parseInt(parts.hour, 10) % 24;
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour,
    minute: parseInt(parts.minute, 10),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    // Stable per-zone calendar-day key, useful for "have we already sent today".
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/**
 * True when `timeZone` is something `Intl` recognises. User-supplied zones must
 * be validated before use -- an unknown identifier makes `Intl` throw.
 *
 * @param {unknown} timeZone
 * @returns {boolean}
 */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The hour (0-23) it currently is for a viewer in `timeZone`, falling back to
 * the league zone when the value is missing or unrecognised.
 *
 * @param {string|null|undefined} timeZone
 * @param {Date} [date]
 * @returns {number}
 */
export function localHour(timeZone, date = new Date()) {
  const zone = isValidTimeZone(timeZone) ? timeZone : LEAGUE_TIMEZONE;
  return zonedParts(date, zone).hour;
}
