/**
 * Converts a game name into a URL-friendly slug.
 *
 * This is the single source of truth for slug generation on the client.
 * src/utils/api.ts re-exports it and src/components/GamesManager.tsx imports it,
 * replacing the copies each of those files used to carry. The server-side twin
 * lives in server/utils/slug.js and is asserted equivalent by
 * test/server/slug.test.js.
 *
 * server/routes/games.js still carries its own copy, but that whole file is
 * dead -- server/index.js mounts games_refactored.js instead.
 *
 * Note: slugs are not guaranteed unique -- "Tommy's League" and "Tommys League"
 * both produce "tommys-league". Lookups by slug resolve to an arbitrary match
 * when names collide.
 */
export function createGameSlug(gameName: string): string {
  return gameName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Drop everything but letters, digits, spaces, hyphens
    .replace(/\s+/g, "-") // Whitespace runs become a single hyphen
    .replace(/-+/g, "-") // Collapse hyphen runs
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens
}
