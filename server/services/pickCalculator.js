import DatabaseServiceFactory from './database/DatabaseServiceFactory.js';

class PickCalculatorService {
  /**
   * Calculate and update pick results for completed games
   * @param {string} seasonId - Season ID to calculate picks for
   * @param {number|null} week - Specific week number (optional)
   * @returns {Promise<{updatedPicks: number, completedGames: number}>}
   */
  async calculatePicks(seasonId, week = null) {
    try {
      if (!seasonId) {
        throw new Error('Season ID is required');
      }

      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      const pickService = DatabaseServiceFactory.getPickService();
      
      // Get completed games for the season/week
      let completedGames;
      if (week) {
        completedGames = await nflDataService.getGamesBySeasonAndWeek(seasonId, week);
      } else {
        completedGames = await nflDataService.getGamesBySeason(seasonId);
      }
      
      // Filter for completed games
      completedGames = completedGames.filter(game =>
        ['STATUS_FINAL', 'STATUS_CLOSED', 'Final'].includes(game.status)
      );

      let updatedPicks = 0;

      for (const game of completedGames) {
        // Determine winning team
        let winningTeamId = null;
        if (game.home_score > game.away_score) {
          winningTeamId = game.home_team_id;
        } else if (game.away_score > game.home_score) {
          winningTeamId = game.away_team_id;
        }
        // If tied, both picks are marked as incorrect (no winner)

        // Update picks for this game
        const updateResult = await pickService.updatePicksForGame(game.id, winningTeamId);
        updatedPicks += updateResult.updatedCount || 0;
      }

      const result = {
        updatedPicks,
        completedGames: completedGames.length,
        week: week || 'all weeks'
      };

      console.log(`[PickCalculator] Updated ${updatedPicks} picks for ${completedGames.length} completed games (${result.week})`);
      return result;

    } catch (error) {
      console.error('[PickCalculator] Failed to calculate picks:', error);
      throw error;
    }
  }

  /**
   * Calculate picks for multiple weeks
   * @param {string} seasonId - Season ID
   * @param {number[]} weeks - Array of week numbers
   * @returns {Promise<{totalUpdatedPicks: number, weekResults: Array}>}
   */
  async calculatePicksForWeeks(seasonId, weeks) {
    const results = [];
    let totalUpdatedPicks = 0;

    for (const week of weeks) {
      try {
        const weekResult = await this.calculatePicks(seasonId, week);
        results.push({
          week,
          ...weekResult
        });
        totalUpdatedPicks += weekResult.updatedPicks;
      } catch (error) {
        console.error(`[PickCalculator] Failed to calculate picks for week ${week}:`, error);
        results.push({
          week,
          error: error.message,
          updatedPicks: 0,
          completedGames: 0
        });
      }
    }

    return {
      totalUpdatedPicks,
      weekResults: results
    };
  }

  /**
   * Get picks statistics for a season
   * @param {string} seasonId - Season ID
   * @param {number|null} week - Specific week (optional)
   * @returns {Promise<Object>}
   */
  async getPicksStats(seasonId, week = null) {
    try {
      const pickService = DatabaseServiceFactory.getPickService();
      const stats = await pickService.getPicksStatsBySeason(seasonId, week);

      return stats || {
        total_picks: 0,
        correct_picks: 0,
        incorrect_picks: 0,
        pending_picks: 0,
        accuracy_percentage: 0
      };
    } catch (error) {
      console.error('[PickCalculator] Failed to get picks stats:', error);
      throw error;
    }
  }
}

export default new PickCalculatorService();