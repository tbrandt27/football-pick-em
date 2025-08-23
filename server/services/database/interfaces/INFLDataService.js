/**
 * NFL Data Service Interface
 * Defines database-agnostic operations for NFL teams and games management
 */
export default class INFLDataService {
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

  /**
   * Get current season (from seasons table)
   * @returns {Promise<Object|null>} Current season or null
   */
  async getCurrentSeason() {
    throw new Error('getCurrentSeason must be implemented');
  }

  /**
   * Get football games by season and week
   * @param {string} seasonId - Season ID
   * @param {number} week - Week number
   * @returns {Promise<Array>} Football games
   */
  async getGamesBySeasonAndWeek(seasonId, week) {
    throw new Error('getGamesBySeasonAndWeek must be implemented');
  }

  /**
   * Get football games by season
   * @param {string} seasonId - Season ID
   * @returns {Promise<Array>} Football games
   */
  async getGamesBySeason(seasonId) {
    throw new Error('getGamesBySeason must be implemented');
  }

  /**
   * Get football game by ID
   * @param {string} gameId - Football game ID
   * @returns {Promise<Object|null>} Football game or null
   */
  async getFootballGameById(gameId) {
    throw new Error('getFootballGameById must be implemented');
  }
}