import DatabaseServiceFactory from "./database/DatabaseServiceFactory.js";
import emailService from "./emailService.js";
import logger from "../utils/logger.js";
import { createGameSlug } from "../utils/slug.js";
import { toBoolean } from "../utils/coerce.js";
import { localHour, zonedParts, LEAGUE_TIMEZONE } from "../utils/timezone.js";

/**
 * Pick reminders.
 *
 * Sends one email per player per pick'em game on the morning of the week's
 * first kickoff, listing how many picks they still owe.
 *
 * WHY THIS RUNS HOURLY RATHER THAN ONCE AT 06:00
 * ----------------------------------------------
 * Players choose their own timezone, so "6am" is a different instant for each
 * of them. A single daily cron could only ever be 6am in one zone. Instead the
 * job wakes every hour and selects the users for whom it is *currently* 6am
 * locally, which covers every zone with one schedule and no duplicate sends.
 *
 * Users with no timezone set fall back to the league zone (Eastern), which is
 * how NFL kickoff times are quoted.
 */

/** Local hour at which reminders go out. */
export const REMINDER_HOUR = 6;

/** Guards against a double send if the hourly tick fires twice in an hour. */
const sentLog = new Map(); // `${userId}:${gameId}:${week}` -> dateKey

/**
 * Games in the given week that a player can still pick, i.e. kickoff is in the
 * future. Already-started games are not "missing" -- they are closed.
 *
 * @param {Array} weekGames
 * @param {Date} now
 */
function openGames(weekGames, now) {
  return weekGames.filter((g) => new Date(g.start_time) > now);
}

/**
 * Decides whether it is reminder time for this user, and returns the reason
 * when it is not. Exported for testing.
 *
 * @param {Object} user
 * @param {Date} now
 * @returns {{send: boolean, reason?: string}}
 */
export function shouldRemind(user, now = new Date()) {
  if (toBoolean(user.disable_emails)) return { send: false, reason: "opted out" };
  if (!user.email) return { send: false, reason: "no email" };
  if (localHour(user.timezone, now) !== REMINDER_HOUR) {
    return { send: false, reason: "not 6am locally" };
  }
  return { send: true };
}

/**
 * Runs one reminder pass.
 *
 * @param {{now?: Date, dryRun?: boolean}} [options]
 * @returns {Promise<{considered:number, sent:number, skipped:Object, errors:number}>}
 */
export async function runPickReminders({ now = new Date(), dryRun = false } = {}) {
  const userService = DatabaseServiceFactory.getUserService();
  const seasonService = DatabaseServiceFactory.getSeasonService();
  const pickService = DatabaseServiceFactory.getPickService();

  const stats = { considered: 0, sent: 0, skipped: {}, errors: 0 };
  const skip = (reason) => {
    stats.skipped[reason] = (stats.skipped[reason] || 0) + 1;
  };

  const season = await seasonService.getCurrentSeason();
  if (!season) {
    logger.debug("[PickReminders] No current season; nothing to do");
    return stats;
  }

  const { week } = await (async () => {
    const espn = (await import("./espnApi.js")).default;
    try {
      return await espn.getCurrentSeasonStatus();
    } catch (error) {
      logger.warn("[PickReminders] Could not resolve current week:", error.message);
      return { week: null };
    }
  })();
  if (!week) return stats;

  const weekGames = await seasonService.getSeasonGames(season.id, { week });
  const open = openGames(weekGames, now);
  if (open.length === 0) {
    logger.debug(`[PickReminders] Week ${week} has no upcoming games`);
    return stats;
  }

  // Only remind on the day the week's first game is played, in league time.
  const firstKickoff = open.reduce(
    (a, b) => (new Date(a.start_time) < new Date(b.start_time) ? a : b)
  );
  const kickoffDay = zonedParts(new Date(firstKickoff.start_time), LEAGUE_TIMEZONE).dateKey;
  const todayLeague = zonedParts(now, LEAGUE_TIMEZONE).dateKey;
  if (kickoffDay !== todayLeague) {
    logger.debug(
      `[PickReminders] First kickoff is ${kickoffDay}, today is ${todayLeague}; not reminder day`
    );
    return stats;
  }

  const users = await userService.getAllUsers();

  for (const user of users) {
    const decision = shouldRemind(user, now);
    if (!decision.send) {
      skip(decision.reason);
      continue;
    }

    let games;
    try {
      games = await userService.getUserGames(user.id);
    } catch (error) {
      logger.warn(`[PickReminders] Could not load games for ${user.id}:`, error.message);
      stats.errors++;
      continue;
    }

    for (const game of games || []) {
      stats.considered++;
      const key = `${user.id}:${game.id}:${week}`;
      if (sentLog.get(key) === todayLeague) {
        skip("already sent today");
        continue;
      }

      try {
        const picks = await pickService.getUserPicks({
          userId: user.id,
          gameId: game.id,
          seasonId: season.id,
          week,
        });
        const picked = new Set((picks || []).map((p) => p.football_game_id));
        const missing = open.filter((g) => !picked.has(g.id)).length;

        if (missing === 0) {
          skip("all picks made");
          continue;
        }

        if (dryRun) {
          stats.sent++;
          continue;
        }

        const result = await emailService.sendPickReminder(user.email,
          `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
          {
            gameName: game.game_name || game.name || "your pick'em game",
            week,
            missing,
            gameSlug: game.game_name ? createGameSlug(game.game_name) : undefined,
            kickoff: firstKickoff.start_time,
          });

        if (result.success) {
          sentLog.set(key, todayLeague);
          stats.sent++;
        } else {
          logger.warn(`[PickReminders] Send failed for ${user.email}: ${result.error}`);
          stats.errors++;
        }
      } catch (error) {
        logger.warn(`[PickReminders] Error for ${user.id}/${game.id}:`, error.message);
        stats.errors++;
      }
    }
  }

  logger.info(`[PickReminders] week ${week}: ${JSON.stringify(stats)}`);
  return stats;
}

/** Clears the duplicate-send guard. Test helper. */
export function _resetSentLog() {
  sentLog.clear();
}
