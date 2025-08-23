import { v4 as uuidv4 } from 'uuid';
import ISeasonService from '../interfaces/ISeasonService.js';
import db from '../../../models/database.js';

/**
 * SQLite-specific Season Service
 * Implements season operations using SQLite database provider
 */
export default class SQLiteSeasonService extends ISeasonService {
  /**
   * Get all seasons
   * @returns {Promise<Array>} All seasons ordered by season desc
   */
  async getAllSeasons() {
    return await db.all(`
      SELECT * FROM seasons 
      ORDER BY season DESC
    `);
  }

  /**
   * Get current season
   * @returns {Promise<Object|null>} Current season or null
   */
  async getCurrentSeason() {
    return await db.get(`
      SELECT * FROM seasons 
      WHERE is_current = 1
    `);
  }

  /**
   * Get season by ID
   * @param {string} seasonId - Season ID
   * @returns {Promise<Object|null>} Season or null
   */
  async getSeasonById(seasonId) {
    return await db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
  }

  /**
   * Create a new season
   * @param {Object} seasonData - Season data
   * @param {string} seasonData.season - Season year/identifier
   * @param {boolean} [seasonData.isCurrent] - Whether this is the current season
   * @returns {Promise<Object>} Created season
   */
  async createSeason(seasonData) {
    const { season, isCurrent = false } = seasonData;

    // Check if season already exists
    const existingSeason = await db.get('SELECT id FROM seasons WHERE season = ?', [season]);
    if (existingSeason) {
      throw new Error('Season already exists');
    }

    // If this is to be the current season, unset the previous current season
    if (isCurrent) {
      await db.run('UPDATE seasons SET is_current = 0');
    }

    const seasonId = uuidv4();
    
    await db.run(`
      INSERT INTO seasons (id, season, is_current)
      VALUES (?, ?, ?)
    `, [seasonId, season, isCurrent ? 1 : 0]);

    return await db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
  }

  /**
   * Update a season
   * @param {string} seasonId - Season ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated season
   */
  async updateSeason(seasonId, updates) {
    const existingSeason = await db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
    if (!existingSeason) {
      throw new Error('Season not found');
    }

    // If updating to be current season, unset previous current
    if (updates.isCurrent && !existingSeason.is_current) {
      await db.run('UPDATE seasons SET is_current = 0');
    }

    await db.run(`
      UPDATE seasons 
      SET season = ?, is_current = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [
      updates.season || existingSeason.season,
      updates.isCurrent !== undefined ? (updates.isCurrent ? 1 : 0) : existingSeason.is_current,
      seasonId
    ]);

    return await db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
  }

  /**
   * Set current season
   * @param {string} seasonId - Season ID to set as current
   * @returns {Promise<void>}
   */
  async setCurrentSeason(seasonId) {
    const season = await db.get('SELECT id FROM seasons WHERE id = ?', [seasonId]);
    if (!season) {
      throw new Error('Season not found');
    }

    // Unset all current seasons
    await db.run('UPDATE seasons SET is_current = 0');
    
    // Set this season as current
    await db.run('UPDATE seasons SET is_current = 1 WHERE id = ?', [seasonId]);
  }

  /**
   * Delete a season
   * @param {string} seasonId - Season ID
   * @returns {Promise<void>}
   */
  async deleteSeason(seasonId) {
    const existingSeason = await db.get('SELECT id FROM seasons WHERE id = ?', [seasonId]);
    if (!existingSeason) {
      throw new Error('Season not found');
    }

    // Check if season has associated games
    const gameCount = await this.getSeasonGameCount(seasonId);
    if (gameCount > 0) {
      throw new Error('Cannot delete season that has associated games');
    }

    await db.run('DELETE FROM seasons WHERE id = ?', [seasonId]);
  }

  /**
   * Get NFL games for a season
   * @param {string} seasonId - Season ID
   * @param {Object} [filters] - Optional filters
   * @param {number} [filters.week] - Week number
   * @returns {Promise<Array>} Football games with team info
   */
  async getSeasonGames(seasonId, filters = {}) {
    let query = `
      SELECT 
        ng.*,
        ht.team_city as home_team_city,
        ht.team_name as home_team_name,
        ht.team_code as home_team_code,
        ht.team_primary_color as home_team_primary_color,
        ht.team_secondary_color as home_team_secondary_color,
        ht.team_logo as home_team_logo,
        at.team_city as away_team_city,
        at.team_name as away_team_name,
        at.team_code as away_team_code,
        at.team_primary_color as away_team_primary_color,
        at.team_secondary_color as away_team_secondary_color,
        at.team_logo as away_team_logo
      FROM football_games ng
      JOIN football_teams ht ON ng.home_team_id = ht.id
      JOIN football_teams at ON ng.away_team_id = at.id
      WHERE ng.season_id = ?
    `;
    
    const params = [seasonId];
    
    if (filters.week) {
      query += ' AND ng.week = ?';
      params.push(parseInt(filters.week));
    }
    
    query += ' ORDER BY ng.week, ng.start_time';

    return await db.all(query, params);
  }

  /**
   * Check if season has associated games
   * @param {string} seasonId - Season ID
   * @returns {Promise<number>} Number of associated games
   */
  async getSeasonGameCount(seasonId) {
    const result = await db.get('SELECT COUNT(*) as count FROM football_games WHERE season_id = ?', [seasonId]);
    return result.count;
  }
}