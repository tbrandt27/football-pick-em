/**
 * Single source of truth for the LocalStack development secret.
 *
 * Both `setup-localstack.js` and `update-localstack-secrets.js` write the same
 * Secrets Manager entry. They previously each hardcoded their own copy with
 * *different* values, so whichever ran last silently won and the local admin
 * account changed depending on which script you used.
 *
 * The cryptographic values are generated, never hardcoded. A literal
 * JWT_SECRET used to live in `update-localstack-secrets.js`, and it was
 * byte-identical to the one documented for the production App Runner service
 * — a committed file is the wrong place for either.
 *
 * Generated values are cached in a gitignored file so they stay stable across
 * re-seeds. That matters for SETTINGS_ENCRYPTION_KEY in particular: rotating
 * it makes any SMTP settings already stored in LocalStack undecryptable.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE_FILE = join(projectRoot, ".localstack-dev-secrets.json");

/** The Secrets Manager entry both scripts target. */
export const DEV_SECRET_NAME = "football-pickem/dev/jwt-secret";

/**
 * Local admin credentials.
 *
 * Deliberately fixed and printed by the seeding scripts — an unpredictable
 * local admin password just means looking it up every time. LocalStack only;
 * never reuse these for a deployed environment.
 *
 * `admin@localhost` matches what `setup-localstack.js` already seeded, so
 * existing local databases keep working (`update-localstack-secrets.js` used
 * to disagree and write `admin@nflpickem.com` instead).
 *
 * The password stays `admin123` on purpose. Changing it would only apply to a
 * freshly initialised database — the initializer does not re-seed an existing
 * admin — so every current local setup would silently stop accepting the
 * documented credentials. The exposure worth fixing here was the hardcoded
 * JWT_SECRET, not a password on a local emulator.
 */
export const DEV_ADMIN_EMAIL = "admin@localhost";
export const DEV_ADMIN_PASSWORD = "admin123";

/**
 * Returns the development secret payload, generating and caching the
 * cryptographic values on first use.
 *
 * @returns {{JWT_SECRET: string, SETTINGS_ENCRYPTION_KEY: string, ADMIN_EMAIL: string, ADMIN_PASSWORD: string}}
 */
export function getDevSecretData() {
  let cached = {};
  if (existsSync(CACHE_FILE)) {
    try {
      cached = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    } catch {
      // A corrupt cache is not worth failing over; regenerate below.
      cached = {};
    }
  }

  const data = {
    JWT_SECRET: cached.JWT_SECRET || randomBytes(64).toString("hex"),
    SETTINGS_ENCRYPTION_KEY: cached.SETTINGS_ENCRYPTION_KEY || randomBytes(32).toString("hex"),
    ADMIN_EMAIL: DEV_ADMIN_EMAIL,
    ADMIN_PASSWORD: DEV_ADMIN_PASSWORD,
  };

  if (data.JWT_SECRET !== cached.JWT_SECRET ||
      data.SETTINGS_ENCRYPTION_KEY !== cached.SETTINGS_ENCRYPTION_KEY) {
    writeFileSync(
      CACHE_FILE,
      JSON.stringify(
        {
          _comment:
            "Generated LocalStack development secrets. Gitignored. Delete this file to rotate them.",
          JWT_SECRET: data.JWT_SECRET,
          SETTINGS_ENCRYPTION_KEY: data.SETTINGS_ENCRYPTION_KEY,
        },
        null,
        2
      ) + "\n",
      { mode: 0o600 }
    );
  }

  return data;
}

/** Console summary that reveals the admin login but not the crypto material. */
export function describeDevSecret(data) {
  return [
    `   - JWT_SECRET: [generated, ${data.JWT_SECRET.length} chars]`,
    `   - SETTINGS_ENCRYPTION_KEY: [generated, ${data.SETTINGS_ENCRYPTION_KEY.length} chars]`,
    `   - ADMIN_EMAIL: ${data.ADMIN_EMAIL}`,
    `   - ADMIN_PASSWORD: ${data.ADMIN_PASSWORD}`,
  ].join("\n");
}
