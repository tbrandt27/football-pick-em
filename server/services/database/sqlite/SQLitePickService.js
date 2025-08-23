import { v4 as uuidv4 } from 'uuid';
import IPickService from '../interfaces/IPickService.js';
import db from '../../../models/database.js';

/**
 * SQLite-specific Pick Service
 * Implements pick operations using SQLite database provider
 */
export default class SQLitePickService extends IPickService {
  constructor() {
    super();
    this.db = db.provider; // Use the singleton database provider
  }

  /**
   * Get picks for a user
   * @param {Object} filters - Filter criteria
   * @param {string} filters.userId - User ID
   * @param {string} [filters.gameId] - Game ID
   * @param {string} [filters.seasonId] - Season ID
   * @param {number} [filters.week] - Week number
   * @returns {Promise<Array>} Picks with game and team info
   */
  async getUserPicks(filters) {
    const { userId, gameId, seasonId, week } = filters;
    
    let query = `
      SELECT
        p.*,
        ng.week,
        ng.start_time,
        ng.status as game_status,
        ht.team_city as home_team_city,
        ht.team_name as home_team_name,
        ht.team_code as home_team_code,
        at.team_city as away_team_city,
        at.team_name as away_team_name,
        at.team_code as away_team_code,
        pt.team_city as pick_team_city,
        pt.team_name as pick_team_name,
        pt.team_code as pick_team_code
      FROM picks p
      JOIN football_games ng ON p.football_game_id = ng.id
      JOIN football_teams ht ON ng.home_team_id = ht.id
      JOIN football_teams at ON ng.away_team_id = at.id
      JOIN football_teams pt ON p.pick_team_id = pt.id
      WHERE p.user_id = ?
    `;
    
    const params = [userId];
    
    if (gameId) {
      query += ' AND p.game_id = ?';
      params.push(gameId);
    }
    
    if (seasonId) {
      query += ' AND p.season_id = ?';
      params.push(seasonId);
    }
    
    if (week) {
      query += ' AND p.week = ?';
      params.push(parseInt(week));
    }
    
    query += ' ORDER BY ng.week, ng.start_time';

    return await this.db.all(query, params);
  }

  /**
   * Create or update a pick
   * @param {Object} pickData - Pick data
   * @param {string} pickData.userId - User ID
   * @param {string} pickData.gameId - Game ID
   * @param {string} pickData.footballGameId - Football game ID
   * @param {string} pickData.pickTeamId - Team ID of the pick
   * @param {number} [pickData.tiebreaker] - Tiebreaker value
   * @returns {Promise<Object>} Created/updated pick
   */
  async createOrUpdatePick(pickData) {
    const { userId, gameId, footballGameId, pickTeamId, tiebreaker } = pickData;

    // Get football game details for season and week
    const footballGame = await this.db.get(`
      SELECT season_id, week, start_time, status
      FROM football_games
      WHERE id = ?
    `, [footballGameId]);

    if (!footballGame) {
      throw new Error('Football game not found');
    }

    // Check if pick already exists
    const existingPick = await this.getExistingPick(userId, gameId, footballGameId);
    const pickId = existingPick?.id || uuidv4();

    if (existingPick) {
      // Update existing pick
      await this.db.run(`
        UPDATE picks
        SET pick_team_id = ?, tiebreaker = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [pickTeamId, tiebreaker || null, pickId]);
    } else {
      // Create new pick
      await this.db.run(`
        INSERT INTO picks (
          id, user_id, game_id, season_id, week, football_game_id,
          pick_team_id, tiebreaker
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        pickId,
        userId,
        gameId,
        footballGame.season_id,
        footballGame.week,
        footballGameId,
        pickTeamId,
        tiebreaker || null
      ]);
    }

    // Return the pick with team info
    return await this.getPickById(pickId);
  }

  /**
   * Delete a pick
   * @param {string} pickId - Pick ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<void>}
   */
  async deletePick(pickId, userId) {
    const pick = await this.getPickById(pickId);
    
    if (!pick) {
      throw new Error('Pick not found');
    }

    if (pick.user_id !== userId) {
      throw new Error('Access denied');
    }

    await this.db.run('DELETE FROM picks WHERE id = ?', [pickId]);
  }

  /**
   * Get pick by ID
   * @param {string} pickId - Pick ID
   * @returns {Promise<Object|null>} Pick with game info
   */
  async getPickById(pickId) {
    return await this.db.get(`
      SELECT
        p.*,
        ng.start_time,
        pt.team_city as pick_team_city,
        pt.team_name as pick_team_name,
        pt.team_code as pick_team_code
      FROM picks p
      JOIN football_games ng ON p.football_game_id = ng.id
      JOIN football_teams pt ON p.pick_team_id = pt.id
      WHERE p.id = ?
    `, [pickId]);
  }

  /**
   * Get picks summary for a game
   * @param {string} gameId - Game ID
   * @param {Object} [filters] - Additional filters
   * @param {string} [filters.seasonId] - Season ID
   * @param {number} [filters.week] - Week number
   * @returns {Promise<Array>} User pick statistics
   */
  async getGamePicksSummary(gameId, filters = {}) {
    const { seasonId, week } = filters;
    
    let query = `
      SELECT 
        gp.user_id,
        u.first_name,
        u.last_name,
        COUNT(p.id) as total_picks,
        SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
        ROUND(
          CASE 
            WHEN COUNT(p.id) > 0 
            THEN (SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(p.id))
            ELSE 0 
          END, 2
        ) as pick_percentage
      FROM game_participants gp
      JOIN users u ON gp.user_id = u.id
      LEFT JOIN picks p ON gp.user_id = p.user_id AND gp.game_id = p.game_id
    `;
    
    const params = [gameId];
    const conditions = ['gp.game_id = ?'];
    
    if (seasonId) {
      conditions.push('(p.season_id = ? OR p.season_id IS NULL)');
      params.push(seasonId);
    }
    
    if (week) {
      conditions.push('(p.week = ? OR p.week IS NULL)');
      params.push(parseInt(week));
    }
    
    query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY gp.user_id, u.first_name, u.last_name';
    query += ' ORDER BY pick_percentage DESC, correct_picks DESC';

    return await this.db.all(query, params);
  }

  /**
   * Check if user has already picked a team in survivor mode
   * @param {string} userId - User ID
   * @param {string} gameId - Game ID
   * @param {string} teamId - Team ID
   * @param {string} seasonId - Season ID
   * @returns {Promise<boolean>} True if team was already picked
   */
  async hasPickedTeamInSurvivor(userId, gameId, teamId, seasonId) {
    const pick = await this.db.get(`
      SELECT id FROM picks
      WHERE user_id = ? AND game_id = ? AND pick_team_id = ? AND season_id = ?
    `, [userId, gameId, teamId, seasonId]);
    
    return !!pick;
  }

  /**
   * Get existing pick for a specific football game
   * @param {string} userId - User ID
   * @param {string} gameId - Game ID
   * @param {string} footballGameId - Football game ID
   * @returns {Promise<Object|null>} Existing pick or null
   */
  async getExistingPick(userId, gameId, footballGameId) {
    return await this.db.get(`
      SELECT id FROM picks
      WHERE user_id = ? AND game_id = ? AND football_game_id = ?
    `, [userId, gameId, footballGameId]);
  }

  /**
   * Update pick correctness after game completion
   * @param {string} pickId - Pick ID
   * @param {boolean} isCorrect - Whether the pick was correct
   * @returns {Promise<void>}
   */
  async updatePickCorrectness(pickId, isCorrect) {
    await this.db.run(`
      UPDATE picks 
      SET is_correct = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [isCorrect ? 1 : 0, pickId]);
  }

  /**
   * Bulk update pick correctness for multiple picks
   * @param {Array} updates - Array of {pickId, isCorrect} objects
   * @returns {Promise<void>}
   */
  async bulkUpdatePickCorrectness(updates) {
    // Use transaction for bulk updates in SQLite
    await this.db.run('BEGIN TRANSACTION');
    
    try {
      for (const update of updates) {
        await this.updatePickCorrectness(update.pickId, update.isCorrect);
      }
      await this.db.run('COMMIT');
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Update all picks for a completed game
   * @param {string} footballGameId - Football game ID
   * @param {string|null} winningTeamId - Winning team ID (null for ties)
   * @returns {Promise<{updatedCount: number}>} Number of picks updated
   */
  async updatePicksForGame(footballGameId, winningTeamId) {
    return new Promise((resolve, reject) => {
      if (winningTeamId) {
        this.db.run(`
          UPDATE picks
          SET is_correct = CASE
            WHEN pick_team_id = ? THEN 1
            ELSE 0
          END,
          updated_at = datetime('now')
          WHERE football_game_id = ?
        `, [winningTeamId, footballGameId], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ updatedCount: this.changes });
          }
        });
      } else {
        // Handle tie games - mark all picks as incorrect
        this.db.run(`
          UPDATE picks
          SET is_correct = 0,
          updated_at = datetime('now')
          WHERE football_game_id = ?
        `, [footballGameId], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ updatedCount: this.changes });
          }
        });
      }
    });
  }

  /**
   * Get pick statistics for a season
   * @param {string} seasonId - Season ID
   * @param {number|null} [week] - Specific week (optional)
   * @returns {Promise<Object>} Pick statistics
   */
  async getPicksStatsBySeason(seasonId, week = null) {
    return new Promise((resolve, reject) => {
      let whereClause = 'WHERE season_id = ?';
      let params = [seasonId];
      
      if (week) {
        whereClause += ' AND week = ?';
        params.push(week);
      }

      this.db.get(`
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
        FROM picks
        ${whereClause}
      `, params, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result || {
            total_picks: 0,
            correct_picks: 0,
            incorrect_picks: 0,
            pending_picks: 0,
            accuracy_percentage: 0
          });
        }
      });
    });
  }
}