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

  /**
   * Get total count of games
   * @returns {Promise<number>} Total number of games
   */
  async getGameCount() {
    throw new Error('getGameCount must be implemented');
  }

  /**
   * Get all games with admin details (for admin management)
   * @returns {Promise<Array>} Games with commissioner, season, participant details
   */
  async getAllGamesWithDetails() {
    throw new Error('getAllGamesWithDetails must be implemented');
  }

  /**
   * Update game season
   * @param {string} gameId - Game ID
   * @param {string} seasonId - New season ID
   * @returns {Promise<void>}
   */
  async updateGameSeason(gameId, seasonId) {
    throw new Error('updateGameSeason must be implemented');
  }

  /**
   * Update game status (active/inactive)
   * @param {string} gameId - Game ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<void>}
   */
  async updateGameStatus(gameId, isActive) {
    throw new Error('updateGameStatus must be implemented');
  }

  /**
   * Get all games (basic information)
   * @returns {Promise<Array>} All games
   */
  async getAllGames() {
    throw new Error('getAllGames must be implemented');
  }

  /**
   * Update game data with provided fields
   * @param {string} gameId - Game ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updateGameData(gameId, updates) {
    throw new Error('updateGameData must be implemented');
  }

  /**
   * Migrate game data (SQLite only)
   * @returns {Promise<void>}
   */
  async migrateGameData() {
    throw new Error('migrateGameData must be implemented');
  }

  /**
   * Update commissioner for games without commissioner
   * @param {string} userId - User ID to set as commissioner
   * @returns {Promise<void>}
   */
  async updateCommissionerForGamesWithoutCommissioner(userId) {
    throw new Error('updateCommissionerForGamesWithoutCommissioner must be implemented');
  }

  /**
   * Get game count by season
   * @param {string} seasonId - Season ID
   * @returns {Promise<number>} Number of games in season
   */
  async getGameCountBySeason(seasonId) {
    throw new Error('getGameCountBySeason must be implemented');
  }
}