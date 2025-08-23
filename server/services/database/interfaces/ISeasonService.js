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

  /**
   * Get total count of seasons
   * @returns {Promise<number>} Total number of seasons
   */
  async getSeasonCount() {
    throw new Error('getSeasonCount must be implemented');
  }

  /**
   * Get total count of football teams
   * @returns {Promise<number>} Total number of football teams
   */
  async getTeamCount() {
    throw new Error('getTeamCount must be implemented');
  }

  /**
   * Get all seasons with game counts (for admin management)
   * @returns {Promise<Array>} Seasons with game count details
   */
  async getAllSeasonsWithCounts() {
    throw new Error('getAllSeasonsWithCounts must be implemented');
  }

  /**
   * Find team by team code
   * @param {string} teamCode - Team code (e.g., 'KC', 'SF')
   * @returns {Promise<Object|null>} Team or null
   */
  async getTeamByCode(teamCode) {
    throw new Error('getTeamByCode must be implemented');
  }

  /**
   * Create or update team
   * @param {Object} teamData - Team data
   * @param {string} teamData.teamCode - Team code
   * @param {string} teamData.teamName - Team name
   * @param {string} teamData.teamCity - Team city
   * @param {string} [teamData.conference] - Conference
   * @param {string} [teamData.division] - Division
   * @param {string} [teamData.primaryColor] - Primary color
   * @param {string} [teamData.secondaryColor] - Secondary color
   * @returns {Promise<Object>} Created/updated team
   */
  async createOrUpdateTeam(teamData) {
    throw new Error('createOrUpdateTeam must be implemented');
  }

  /**
   * Find football game by criteria
   * @param {Object} criteria - Search criteria
   * @param {string} criteria.seasonId - Season ID
   * @param {number} criteria.week - Week number
   * @param {string} criteria.homeTeamId - Home team ID
   * @param {string} criteria.awayTeamId - Away team ID
   * @returns {Promise<Object|null>} Football game or null
   */
  async findFootballGame(criteria) {
    throw new Error('findFootballGame must be implemented');
  }

  /**
   * Create football game
   * @param {Object} gameData - Game data
   * @returns {Promise<Object>} Created game
   */
  async createFootballGame(gameData) {
    throw new Error('createFootballGame must be implemented');
  }

  /**
   * Update football game
   * @param {string} gameId - Game ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated game
   */
  async updateFootballGame(gameId, updates) {
    throw new Error('updateFootballGame must be implemented');
  }
}