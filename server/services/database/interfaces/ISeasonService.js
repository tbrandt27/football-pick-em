/**
 * Season Service Interface
 * Defines database-agnostic operations for season management
 */
export default class ISeasonService {
  /**
   * Get all seasons
   * @returns {Promise<Array>} All seasons ordered by season desc
   */
  async getAllSeasons() {
    throw new Error('getAllSeasons must be implemented');
  }

  /**
   * Get current season
   * @returns {Promise<Object|null>} Current season or null
   */
  async getCurrentSeason() {
    throw new Error('getCurrentSeason must be implemented');
  }

  /**
   * Get season by ID
   * @param {string} seasonId - Season ID
   * @returns {Promise<Object|null>} Season or null
   */
  async getSeasonById(seasonId) {
    throw new Error('getSeasonById must be implemented');
  }

  /**
   * Create a new season
   * @param {Object} seasonData - Season data
   * @param {string} seasonData.season - Season year/identifier
   * @param {boolean} [seasonData.isCurrent] - Whether this is the current season
   * @returns {Promise<Object>} Created season
   */
  async createSeason(seasonData) {
    throw new Error('createSeason must be implemented');
  }

  /**
   * Update a season
   * @param {string} seasonId - Season ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated season
   */
  async updateSeason(seasonId, updates) {
    throw new Error('updateSeason must be implemented');
  }

  /**
   * Set current season
   * @param {string} seasonId - Season ID to set as current
   * @returns {Promise<void>}
   */
  async setCurrentSeason(seasonId) {
    throw new Error('setCurrentSeason must be implemented');
  }

  /**
   * Delete a season
   * @param {string} seasonId - Season ID
   * @returns {Promise<void>}
   */
  async deleteSeason(seasonId) {
    throw new Error('deleteSeason must be implemented');
  }

  /**
   * Get NFL games for a season
   * @param {string} seasonId - Season ID
   * @param {Object} [filters] - Optional filters
   * @param {number} [filters.week] - Week number
   * @returns {Promise<Array>} Football games with team info
   */
  async getSeasonGames(seasonId, filters = {}) {
    throw new Error('getSeasonGames must be implemented');
  }

  /**
   * Check if season has associated games
   * @param {string} seasonId - Season ID
   * @returns {Promise<number>} Number of associated games
   */
  async getSeasonGameCount(seasonId) {
    throw new Error('getSeasonGameCount must be implemented');
  }
}