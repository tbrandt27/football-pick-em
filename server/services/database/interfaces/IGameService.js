/**
 * Game Service Interface
 * Defines database-agnostic operations for game management
 */
export default class IGameService {
  /**
   * Get all games for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Games with participant info
   */
  async getUserGames(userId) {
    throw new Error('getUserGames must be implemented');
  }

  /**
   * Get game by slug
   * @param {string} gameSlug - URL-friendly game identifier
   * @param {string} userId - User ID for access control
   * @returns {Promise<Object|null>} Game with participants
   */
  async getGameBySlug(gameSlug, userId) {
    throw new Error('getGameBySlug must be implemented');
  }

  /**
   * Get game by ID
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID for access control
   * @returns {Promise<Object|null>} Game with participants
   */
  async getGameById(gameId, userId) {
    throw new Error('getGameById must be implemented');
  }

  /**
   * Create a new game
   * @param {Object} gameData - Game creation data
   * @param {string} gameData.gameName - Name of the game
   * @param {string} gameData.gameType - Type of game (weekly/survivor)
   * @param {string} gameData.commissionerId - User ID of the commissioner
   * @param {string} gameData.seasonId - Season ID
   * @returns {Promise<Object>} Created game
   */
  async createGame(gameData) {
    throw new Error('createGame must be implemented');
  }

  /**
   * Update a game
   * @param {string} gameId - Game ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated game
   */
  async updateGame(gameId, updates) {
    throw new Error('updateGame must be implemented');
  }

  /**
   * Delete a game
   * @param {string} gameId - Game ID
   * @returns {Promise<void>}
   */
  async deleteGame(gameId) {
    throw new Error('deleteGame must be implemented');
  }

  /**
   * Add participant to game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} role - Participant role (owner/player)
   * @returns {Promise<Object>} Participant record
   */
  async addParticipant(gameId, userId, role = 'player') {
    throw new Error('addParticipant must be implemented');
  }

  /**
   * Remove participant from game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async removeParticipant(gameId, userId) {
    throw new Error('removeParticipant must be implemented');
  }

  /**
   * Check if user is participant in game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Participant info or null
   */
  async getParticipant(gameId, userId) {
    throw new Error('getParticipant must be implemented');
  }

  /**
   * Get all participants for a game
   * @param {string} gameId - Game ID
   * @returns {Promise<Array>} Participants with user info
   */
  async getGameParticipants(gameId) {
    throw new Error('getGameParticipants must be implemented');
  }
}