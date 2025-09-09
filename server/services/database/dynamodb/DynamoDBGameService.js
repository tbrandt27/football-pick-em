import { v4 as uuidv4 } from 'uuid';
import IGameService from '../interfaces/IGameService.js';
import db from '../../../models/database.js';

/**
 * DynamoDB-specific Game Service
 * Implements game operations using DynamoDB database provider
 */
export default class DynamoDBGameService extends IGameService {
  constructor() {
    super();
    this.db = db.provider; // Use the singleton database provider
  }

  /**
   * Get all games for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Games with participant info
   */
  async getUserGames(userId) {
    // Use GSI user_id-index for efficient lookup
    const participations = await this.db._getByUserIdGSI('game_participants', userId);

    if (!participations || participations.length === 0) {
      return [];
    }

    // Get game details for each participation
    const games = [];
    for (const participation of participations) {
      const game = await this.db._dynamoGet('pickem_games', {
        id: participation.game_id
      });

      if (game.Item) {
        // Get participant count for this game using GSI game_id-index
        const allParticipants = await this.db._getByGameIdGSI('game_participants', participation.game_id);

        const playerCount = allParticipants?.length || 0;
        const ownerCount = allParticipants?.filter(p => p.role === 'owner').length || 0;

        games.push({
          ...game.Item,
          game_type: game.Item.type || 'weekly',
          user_role: participation.role,
          player_count: playerCount,
          owner_count: ownerCount
        });
      }
    }

    // Sort by created_at DESC
    return games.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Get game by slug
   * @param {string} gameSlug - URL-friendly game identifier
   * @param {string} userId - User ID for access control
   * @returns {Promise<Object|null>} Game with participants
   */
  async getGameBySlug(gameSlug, userId) {
    // Helper function to create URL-friendly slugs
    const createGameSlug = (gameName) => {
      return gameName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim()
        .replace(/^-+|-+$/g, "");
    };

    // Use GSI user_id-index to check if user is a participant in any games
    const userParticipations = await this.db._getByUserIdGSI('game_participants', userId);

    if (!userParticipations || userParticipations.length === 0) {
      throw new Error('Access denied');
    }

    // Only check games that the user participates in
    const userGameIds = userParticipations.map(p => p.game_id);
    let game = null;

    // Batch get games the user participates in instead of scanning all games
    for (const gameId of userGameIds) {
      const gameResult = await this.db._dynamoGet('pickem_games', { id: gameId });
      if (gameResult.Item && createGameSlug(gameResult.Item.game_name) === gameSlug) {
        game = gameResult.Item;
        break;
      }
    }

    if (!game) {
      return null;
    }

    // User already verified to have access through participation check
    // Get commissioner name
    if (game.commissioner_id) {
      const commissioner = await this.db._dynamoGet('users', {
        id: game.commissioner_id
      });
      if (commissioner.Item) {
        game.commissioner_name = `${commissioner.Item.first_name} ${commissioner.Item.last_name}`;
      }
    }

    // Get participants
    const participants = await this.getGameParticipants(game.id);

    return {
      ...game,
      game_type: game.type || 'weekly',
      participants,
      player_count: participants.length,
    };
  }

  /**
   * Get game by ID
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID for access control
   * @returns {Promise<Object|null>} Game with participants
   */
  async getGameById(gameId, userId) {
    // Check if user has access to this game
    const participant = await this.getParticipant(gameId, userId);
    if (!participant) {
      throw new Error('Access denied');
    }

    const gameResult = await this.db._dynamoGet('pickem_games', { id: gameId });
    
    if (!gameResult.Item) {
      return null;
    }

    const game = gameResult.Item;

    // Get participants
    const participants = await this.getGameParticipants(gameId);
    
    const playerCount = participants.length;
    const ownerCount = participants.filter(p => p.role === 'owner').length;

    return {
      ...game,
      game_type: game.type || 'weekly',
      participants,
      player_count: playerCount,
      owner_count: ownerCount
    };
  }

  /**
   * Get game by ID without access control (for admin operations)
   * @param {string} gameId - Game ID
   * @returns {Promise<Object|null>} Game information
   */
  async getGameByIdForAdmin(gameId) {
    const gameResult = await this.db._dynamoGet('pickem_games', { id: gameId });
    
    if (!gameResult.Item) {
      return null;
    }

    const game = gameResult.Item;

    // Get participants
    const participants = await this.getGameParticipants(gameId);
    
    const playerCount = participants.length;
    const ownerCount = participants.filter(p => p.role === 'owner').length;

    return {
      ...game,
      game_type: game.type || 'weekly',
      participants,
      player_count: playerCount,
      owner_count: ownerCount
    };
  }

  /**
   * Create a new game
   * @param {Object} gameData - Game creation data
   * @returns {Promise<Object>} Created game
   */
  async createGame(gameData) {
    const { gameName, gameType, commissionerId, seasonId } = gameData;
    const gameId = uuidv4();

    // Convert gameType to match database values
    const dbGameType = gameType === "week" ? "weekly" : "survivor";

    const gameItem = {
      id: gameId,
      game_name: gameName,
      type: dbGameType,
      commissioner_id: commissionerId,
      season_id: seasonId,
      is_active: true
    };

    // Create the game
    await this.db._dynamoPut('pickem_games', gameItem);

    // Add creator as owner
    await this.addParticipant(gameId, commissionerId, 'owner');

    // Return the created game with counts
    return {
      ...gameItem,
      game_type: gameItem.type || 'weekly',
      player_count: 1,
      owner_count: 1
    };
  }

  /**
   * Update a game
   * @param {string} gameId - Game ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated game
   */
  async updateGame(gameId, updates) {
    const existingGameResult = await this.db._dynamoGet('pickem_games', { id: gameId });
    
    if (!existingGameResult.Item) {
      throw new Error('Game not found');
    }

    const existingGame = existingGameResult.Item;
    
    const updateData = {
      game_name: updates.gameName || existingGame.game_name,
      type: updates.gameType || existingGame.type
    };

    await this.db._dynamoUpdate('pickem_games', { id: gameId }, updateData);

    // Return updated game
    const updatedGameResult = await this.db._dynamoGet('pickem_games', { id: gameId });
    return updatedGameResult.Item;
  }

  /**
   * Delete a game
   * @param {string} gameId - Game ID
   * @returns {Promise<void>}
   */
  async deleteGame(gameId) {
    const existingGameResult = await this.db._dynamoGet('pickem_games', { id: gameId });
    
    if (!existingGameResult.Item) {
      throw new Error('Game not found');
    }

    // Delete related records using Scan since we're searching by non-partition key fields
    // Note: In production, you'd want to use DynamoDB transactions for consistency
    
    // Delete picks
    const picks = await this.db._dynamoScan('picks', { game_id: gameId });
    if (picks.Items) {
      for (const pick of picks.Items) {
        await this.db._dynamoDelete('picks', { id: pick.id });
      }
    }

    // Delete weekly standings
    const standings = await this.db._dynamoScan('weekly_standings', { game_id: gameId });
    if (standings.Items) {
      for (const standing of standings.Items) {
        await this.db._dynamoDelete('weekly_standings', { id: standing.id });
      }
    }

    // Delete game invitations
    const invitations = await this.db._dynamoScan('game_invitations', { game_id: gameId });
    if (invitations.Items) {
      for (const invitation of invitations.Items) {
        await this.db._dynamoDelete('game_invitations', { id: invitation.id });
      }
    }

    // Delete game participants
    const participants = await this.db._dynamoScan('game_participants', { game_id: gameId });
    if (participants.Items) {
      for (const participant of participants.Items) {
        await this.db._dynamoDelete('game_participants', { id: participant.id });
      }
    }
    
    // Finally delete the game itself
    await this.db._dynamoDelete('pickem_games', { id: gameId });
  }

  /**
   * Add participant to game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @param {string} role - Participant role (owner/player)
   * @returns {Promise<Object>} Participant record
   */
  async addParticipant(gameId, userId, role = 'player') {
    const participantId = uuidv4();
    
    const participantItem = {
      id: participantId,
      game_id: gameId,
      user_id: userId,
      role: role
    };

    await this.db._dynamoPut('game_participants', participantItem);

    // Get user info for return
    const userResult = await this.db._dynamoGet('users', { id: userId });
    const user = userResult.Item;

    return {
      ...participantItem,
      first_name: user?.first_name,
      last_name: user?.last_name,
      email: user?.email,
      display_name: user ? `${user.first_name} ${user.last_name}` : null
    };
  }

  /**
   * Remove participant from game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async removeParticipant(gameId, userId) {
    const participant = await this.getParticipant(gameId, userId);
    
    if (!participant) {
      throw new Error('User is not in this game');
    }

    // Don't allow removing owners
    if (participant.role === "owner") {
      throw new Error('Cannot remove game owner');
    }

    // Delete participant record
    await this.db._dynamoDelete('game_participants', { id: participant.id });

    // Also remove any picks for this user in this game
    const picks = await this.db._dynamoScan('picks', { 
      user_id: userId,
      game_id: gameId 
    });
    
    if (picks.Items) {
      for (const pick of picks.Items) {
        await this.db._dynamoDelete('picks', { id: pick.id });
      }
    }
  }

  /**
   * Check if user is participant in game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Participant info or null
   */
  async getParticipant(gameId, userId) {
    try {
      // Try to use composite GSI for precise user-game lookup
      const compositeKey = this.db._createCompositeKey(gameId, userId);
      const result = await this.db._dynamoQueryGSI('game_participants', 'game_id-user_id-index', {
        game_id_user_id: compositeKey
      });

      return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
    } catch (error) {
      // Handle missing GSI error - fallback to user_id-index GSI and filter
      if (error.code === 'ValidationException' && (error.message.includes('game_id-user_id-index') || error.message.includes('does not have the specified index'))) {
        console.log(`[DynamoDBGameService] ✅ FALLBACK TRIGGERED: GSI 'game_id-user_id-index' not found, falling back to user_id-index for user ${userId}, game ${gameId}`);
        
        // Fallback: Use user_id-index GSI and filter for gameId
        const userParticipations = await this.db._getByUserIdGSI('game_participants', userId);
        
        if (!userParticipations || userParticipations.length === 0) {
          console.log(`[DynamoDBGameService] ✅ FALLBACK RESULT: No participations found for user ${userId}`);
          return null;
        }
        
        // Find the participation for this specific game
        const participation = userParticipations.find(p => p.game_id === gameId);
        console.log(`[DynamoDBGameService] ✅ FALLBACK RESULT: ${participation ? 'Found' : 'Not found'} participation for user ${userId} in game ${gameId}`);
        return participation || null;
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get all participants for a game
   * @param {string} gameId - Game ID
   * @returns {Promise<Array>} Participants with user info
   */
  async getGameParticipants(gameId) {
    // Use GSI game_id-index for efficient lookup
    const participants = await this.db._getByGameIdGSI('game_participants', gameId);

    if (!participants) {
      return [];
    }

    // Get user info for each participant
    const participantsWithUserInfo = [];
    for (const participant of participants) {
      const userResult = await this.db._dynamoGet('users', { id: participant.user_id });
      const user = userResult.Item;

      participantsWithUserInfo.push({
        ...participant,
        user_id: participant.user_id,
        first_name: user?.first_name,
        last_name: user?.last_name,
        email: user?.email,
        display_name: user ? `${user.first_name} ${user.last_name}` : null
      });
    }

    // Sort by role, then by name
    return participantsWithUserInfo.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === 'owner' ? -1 : 1;
      }
      return (a.display_name || '').localeCompare(b.display_name || '');
    });
  }

  /**
   * Get total count of games
   * @returns {Promise<number>} Total number of games
   */
  async getGameCount() {
    const result = await this.db._dynamoScan('pickem_games');
    return result.Items ? result.Items.length : 0;
  }

  /**
   * Get all games with admin details (for admin management)
   * @returns {Promise<Array>} Games with commissioner, season, participant details
   */
  async getAllGamesWithDetails() {
    const result = await this.db._dynamoScan('pickem_games');
    const games = result.Items || [];

    // For each game, get the additional data
    const gamesWithDetails = await Promise.all(games.map(async (game) => {
      // Get commissioner name
      let commissioner_name = 'Unknown';
      if (game.commissioner_id) {
        try {
          const commissionerResult = await this.db._dynamoGet('users', { id: game.commissioner_id });
          const commissioner = commissionerResult.Item;
          if (commissioner) {
            commissioner_name = `${commissioner.first_name} ${commissioner.last_name}`;
          }
        } catch (error) {
          console.warn(`Failed to get commissioner info for game ${game.id}:`, error);
        }
      }
      
      // Get season info
      let season_year = null;
      let season_is_current = false;
      if (game.season_id) {
        try {
          const seasonResult = await this.db._dynamoGet('seasons', { id: game.season_id });
          const season = seasonResult.Item;
          if (season) {
            season_year = season.season;
            season_is_current = Boolean(season.is_current);
          }
        } catch (error) {
          console.warn(`Failed to get season info for game ${game.id}:`, error);
        }
      }
      
      // Get participant count
      let participant_count = 0;
      try {
        const gameParticipants = await this.db._getByGameIdGSI('game_participants', game.id);
        participant_count = gameParticipants ? gameParticipants.length : 0;
      } catch (error) {
        console.warn(`Failed to get participant count for game ${game.id}:`, error);
      }
      
      return {
        ...game,
        name: game.game_name || 'Unnamed Game',
        commissioner_name,
        season_year,
        season_is_current,
        participant_count
      };
    }));
    
    // Sort by created_at descending
    return gamesWithDetails.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Update game season
   * @param {string} gameId - Game ID
   * @param {string} seasonId - New season ID
   * @returns {Promise<void>}
   */
  async updateGameSeason(gameId, seasonId) {
    await this.db._dynamoUpdate('pickem_games', { id: gameId }, { season_id: seasonId });
  }

  /**
   * Update game status (active/inactive)
   * @param {string} gameId - Game ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<void>}
   */
  async updateGameStatus(gameId, isActive) {
    await this.db._dynamoUpdate('pickem_games', { id: gameId }, { is_active: isActive });
  }

  /**
   * Get all games (basic information)
   * @returns {Promise<Array>} All games
   */
  async getAllGames() {
    const result = await this.db._dynamoScan('pickem_games');
    const games = result.Items || [];
    
    // Sort by created_at descending
    return games.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  /**
   * Update game data with provided fields
   * @param {string} gameId - Game ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updateGameData(gameId, updates) {
    await this.db._dynamoUpdate('pickem_games', { id: gameId }, {
      ...updates
    });
  }

  /**
   * Migrate game data (DynamoDB - not applicable)
   * @returns {Promise<void>}
   */
  async migrateGameData() {
    // Not applicable for DynamoDB - handled in admin route logic
    return;
  }

  /**
   * Update commissioner for games without commissioner
   * @param {string} userId - User ID to set as commissioner
   * @returns {Promise<void>}
   */
  async updateCommissionerForGamesWithoutCommissioner(userId) {
    // For DynamoDB, we need to scan for games and update individually
    const result = await this.db._dynamoScan('pickem_games');
    const games = result.Items || [];
    
    for (const game of games) {
      if (!game.commissioner_id || game.commissioner_id === '') {
        await this.updateGameData(game.id, { commissioner_id: userId });
      }
    }
  }

  /**
   * Get game count by season
   * @param {string} seasonId - Season ID
   * @returns {Promise<number>} Number of games in season
   */
  async getGameCountBySeason(seasonId) {
    try {
      console.log(`[DynamoDBGameService] Getting game count for season: ${seasonId}`);
      const result = await this.db._dynamoScan('pickem_games', { season_id: seasonId });
      const count = result.Items ? result.Items.length : 0;
      console.log(`[DynamoDBGameService] Found ${count} games for season ${seasonId}`);
      return count;
    } catch (error) {
      console.error(`[DynamoDBGameService] Error getting game count for season ${seasonId}:`, error);
      return 0; // Return 0 on error to be safe
    }
  }
}