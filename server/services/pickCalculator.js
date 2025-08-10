import db from '../models/database.js';

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

      let whereClause = 'WHERE ng.season_id = ?';
      let params = [seasonId];
      
      if (week) {
        whereClause += ' AND ng.week = ?';
        params.push(week);
      }

      // Get completed games
      const completedGames = await db.all(`
        SELECT ng.id, ng.home_team_id, ng.away_team_id, ng.home_score, ng.away_score, ng.week
        FROM nfl_games ng
        ${whereClause} AND ng.status IN ('STATUS_FINAL', 'STATUS_CLOSED', 'Final')
      `, params);

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
        if (winningTeamId) {
          const result = await db.run(`
            UPDATE picks 
            SET is_correct = CASE 
              WHEN pick_team_id = ? THEN 1 
              ELSE 0 
            END,
            updated_at = datetime('now')
            WHERE nfl_game_id = ?
          `, [winningTeamId, game.id]);
          
          updatedPicks += result.changes || 0;
        } else {
          // Handle tie games - mark all picks as incorrect
          const result = await db.run(`
            UPDATE picks 
            SET is_correct = 0,
            updated_at = datetime('now')
            WHERE nfl_game_id = ?
          `, [game.id]);
          
          updatedPicks += result.changes || 0;
        }
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
      let whereClause = 'WHERE p.season_id = ?';
      let params = [seasonId];
      
      if (week) {
        whereClause += ' AND p.week = ?';
        params.push(week);
      }

      const stats = await db.get(`
        SELECT 
          COUNT(*) as total_picks,
          COUNT(CASE WHEN is_correct = 1 THEN 1 END) as correct_picks,
          COUNT(CASE WHEN is_correct = 0 THEN 1 END) as incorrect_picks,
          COUNT(CASE WHEN is_correct IS NULL THEN 1 END) as pending_picks,
          ROUND(
            (COUNT(CASE WHEN is_correct = 1 THEN 1 END) * 100.0) / 
            NULLIF(COUNT(CASE WHEN is_correct IS NOT NULL THEN 1 END), 0), 
            2
          ) as accuracy_percentage
        FROM picks p
        ${whereClause}
      `, params);

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