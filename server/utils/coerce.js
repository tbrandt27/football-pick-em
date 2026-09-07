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

/**
 * Serialises a flag for DynamoDB storage.
 *
 * DynamoDB rows in this app store booleans as the strings "true"/"false".
 * Older rows used a native BOOL, which is why `toBoolean` exists on the read
 * side -- but every *write* must produce the same encoding or the GSIs stop
 * working: a GSI key is typed, so a BOOL value is simply absent from a
 * String-keyed index. `is_admin-index` indexed 0 of 18 rows for exactly this
 * reason until the data was normalised.
 *
 * Runs the input through `toBoolean` first, so it is safe to pass anything a
 * caller might already have (`true`, `1`, `"false"`, `undefined`).
 *
 * @param {unknown} value
 * @returns {"true"|"false"}
 */
export function toFlagString(value) {
  return toBoolean(value) ? "true" : "false";
}

/**
 * Serialises a flag for SQLite storage as 0/1.
 *
 * Less hazardous than the DynamoDB encoding (0 and 1 are correctly falsy and
 * truthy in JS), but writing through this keeps both providers deriving their
 * storage form from the same canonical boolean.
 *
 * @param {unknown} value
 * @returns {0|1}
 */
export function toFlagInt(value) {
  return toBoolean(value) ? 1 : 0;
}

export default toBoolean;
