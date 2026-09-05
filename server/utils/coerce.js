/**
 * Coerces a persisted flag into a real boolean.
 *
 * The two providers store booleans differently:
 *   - SQLite  -> 0 / 1 (and sometimes true / false)
 *   - DynamoDB -> the strings "true" / "false"
 *
 * The string form is the dangerous one: `!"false"` is `false` and
 * `Boolean("false")` is `true`, so a plain truthiness check treats a
 * non-admin as an admin. Route every persisted flag through this helper
 * instead of testing it directly.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return Boolean(value);
}

export default toBoolean;
