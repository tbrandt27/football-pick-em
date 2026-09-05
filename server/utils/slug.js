/**
 * Server-side copy of the game slug rules.
 *
 * Must stay behaviourally identical to src/lib/slug.ts -- the browser builds a
 * slug for the URL and the server resolves that slug back to a game, so any
 * divergence produces 404s. test/server/slug.test.js asserts the two agree.
 *
 * @param {string} gameName
 * @returns {string}
 */
export function createGameSlug(gameName) {
  return gameName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default createGameSlug;
