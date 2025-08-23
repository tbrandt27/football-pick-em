/**
 * Pick Service Interface
 * Defines database-agnostic operations for pick management
 */
export default class IPickService {
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
    throw new Error('getUserPicks must be implemented');
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
    throw new Error('createOrUpdatePick must be implemented');
  }

  /**
   * Delete a pick
   * @param {string} pickId - Pick ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<void>}
   */
  async deletePick(pickId, userId) {
    throw new Error('deletePick must be implemented');
  }

  /**
   * Get pick by ID
   * @param {string} pickId - Pick ID
   * @returns {Promise<Object|null>} Pick with game info
   */
  async getPickById(pickId) {
    throw new Error('getPickById must be implemented');
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
    throw new Error('getGamePicksSummary must be implemented');
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
    throw new Error('hasPickedTeamInSurvivor must be implemented');
  }

  /**
   * Get existing pick for a specific football game
   * @param {string} userId - User ID
   * @param {string} gameId - Game ID
   * @param {string} footballGameId - Football game ID
   * @returns {Promise<Object|null>} Existing pick or null
   */
  async getExistingPick(userId, gameId, footballGameId) {
    throw new Error('getExistingPick must be implemented');
  }

  /**
   * Update pick correctness after game completion
   * @param {string} pickId - Pick ID
   * @param {boolean} isCorrect - Whether the pick was correct
   * @returns {Promise<void>}
   */
  async updatePickCorrectness(pickId, isCorrect) {
    throw new Error('updatePickCorrectness must be implemented');
  }

  /**
   * Bulk update pick correctness for multiple picks
   * @param {Array} updates - Array of {pickId, isCorrect} objects
   * @returns {Promise<void>}
   */
  async bulkUpdatePickCorrectness(updates) {
    throw new Error('bulkUpdatePickCorrectness must be implemented');
  }

  /**
   * Update all picks for a completed game
   * @param {string} footballGameId - Football game ID
   * @param {string|null} winningTeamId - Winning team ID (null for ties)
   * @returns {Promise<{updatedCount: number}>} Number of picks updated
   */
  async updatePicksForGame(footballGameId, winningTeamId) {
    throw new Error('updatePicksForGame must be implemented');
  }

  /**
   * Get pick statistics for a season
   * @param {string} seasonId - Season ID
   * @param {number|null} [week] - Specific week (optional)
   * @returns {Promise<Object>} Pick statistics
   */
  async getPicksStatsBySeason(seasonId, week = null) {
    throw new Error('getPicksStatsBySeason must be implemented');
  }
}