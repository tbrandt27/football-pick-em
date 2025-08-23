import { v4 as uuidv4 } from 'uuid';
import IGameService from '../interfaces/IGameService.js';
import db from '../../../models/database.js';

/**
 * SQLite-specific Game Service
 * Implements game operations using SQLite database provider
 */
export default class SQLiteGameService extends IGameService {
  /**
   * Get all games for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Games with participant info
   */
  async getUserGames(userId) {
    return await db.all(
      `
      SELECT
        g.*,
        gp.role as user_role,
        COUNT(gp2.id) as player_count,
        COUNT(CASE WHEN gp2.role = 'owner' THEN 1 END) as owner_count
      FROM game_participants gp
      JOIN pickem_games g ON gp.game_id = g.id
      LEFT JOIN game_participants gp2 ON g.id = gp2.game_id
      WHERE gp.user_id = ?
      GROUP BY g.id, gp.role
      ORDER BY g.created_at DESC
    `,
      [userId]
    );
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

    // Get all games and find the one that matches the slug
    const games = await db.all(`
      SELECT g.*, u.first_name || ' ' || u.last_name as commissioner_name
      FROM pickem_games g
      LEFT JOIN users u ON g.commissioner_id = u.id
    `);

    // Find game by matching slug
    const game = games.find((g) => createGameSlug(g.game_name) === gameSlug);

    if (!game) {
      return null;
    }

    // Check if user has access
    const isParticipant = await this.getParticipant(game.id, userId);
    const isCommissioner = game.commissioner_id === userId;

    if (!isParticipant && !isCommissioner) {
      throw new Error('Access denied');
    }

    // Get participants
    const participants = await this.getGameParticipants(game.id);

    return {
      ...game,
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

    const game = await db.get(
      `
      SELECT 
        g.*,
        COUNT(gp.id) as player_count,
        COUNT(CASE WHEN gp.role = 'owner' THEN 1 END) as owner_count
      FROM pickem_games g
      LEFT JOIN game_participants gp ON g.id = gp.game_id
      WHERE g.id = ?
      GROUP BY g.id
    `,
      [gameId]
    );

    if (!game) {
      return null;
    }

    // Get participants
    const participants = await this.getGameParticipants(gameId);

    return {
      ...game,
      participants,
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

    // Create the game
    await db.run(
      `
      INSERT INTO pickem_games (id, game_name, type, commissioner_id, season_id)
      VALUES (?, ?, ?, ?, ?)
    `,
      [gameId, gameName, dbGameType, commissionerId, seasonId]
    );

    // Add creator as owner
    await this.addParticipant(gameId, commissionerId, 'owner');

    // Return the created game with counts
    return await db.get(
      `
      SELECT
        g.*,
        COUNT(gp.id) as player_count,
        COUNT(CASE WHEN gp.role = 'owner' THEN 1 END) as owner_count
      FROM pickem_games g
      LEFT JOIN game_participants gp ON g.id = gp.game_id
      WHERE g.id = ?
      GROUP BY g.id
    `,
      [gameId]
    );
  }

  /**
   * Update a game
   * @param {string} gameId - Game ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated game
   */
  async updateGame(gameId, updates) {
    const existingGame = await db.get(
      "SELECT * FROM pickem_games WHERE id = ?",
      [gameId]
    );
    
    if (!existingGame) {
      throw new Error('Game not found');
    }

    await db.run(
      `
      UPDATE pickem_games
      SET game_name = ?, type = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
      [
        updates.gameName || existingGame.game_name,
        updates.gameType || existingGame.type,
        gameId,
      ]
    );

    return await db.get(
      "SELECT * FROM pickem_games WHERE id = ?",
      [gameId]
    );
  }

  /**
   * Delete a game
   * @param {string} gameId - Game ID
   * @returns {Promise<void>}
   */
  async deleteGame(gameId) {
    const existingGame = await db.get(
      "SELECT id FROM pickem_games WHERE id = ?",
      [gameId]
    );
    
    if (!existingGame) {
      throw new Error('Game not found');
    }

    // Delete related records manually to handle foreign key constraints
    await db.run("DELETE FROM picks WHERE game_id = ?", [gameId]);
    await db.run("DELETE FROM weekly_standings WHERE game_id = ?", [gameId]);
    await db.run("DELETE FROM game_invitations WHERE game_id = ?", [gameId]);
    await db.run("DELETE FROM game_participants WHERE game_id = ?", [gameId]);
    
    // Finally delete the game itself
    await db.run("DELETE FROM pickem_games WHERE id = ?", [gameId]);
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
    
    await db.run(
      `
      INSERT INTO game_participants (id, game_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `,
      [participantId, gameId, userId, role]
    );

    return await db.get(
      `
      SELECT 
        gp.*,
        u.first_name,
        u.last_name,
        u.email,
        u.first_name || ' ' || u.last_name as display_name
      FROM game_participants gp
      JOIN users u ON gp.user_id = u.id
      WHERE gp.id = ?
    `,
      [participantId]
    );
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

    await db.run(
      `
      DELETE FROM game_participants 
      WHERE game_id = ? AND user_id = ?
    `,
      [gameId, userId]
    );

    // Also remove any picks for this user in this game
    await db.run(
      `
      DELETE FROM picks 
      WHERE user_id = ? AND game_id = ?
    `,
      [userId, gameId]
    );
  }

  /**
   * Check if user is participant in game
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Participant info or null
   */
  async getParticipant(gameId, userId) {
    return await db.get(
      `
      SELECT * FROM game_participants 
      WHERE game_id = ? AND user_id = ?
    `,
      [gameId, userId]
    );
  }

  /**
   * Get all participants for a game
   * @param {string} gameId - Game ID
   * @returns {Promise<Array>} Participants with user info
   */
  async getGameParticipants(gameId) {
    return await db.all(
      `
      SELECT 
        gp.role,
        gp.id,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.first_name || ' ' || u.last_name as display_name
      FROM game_participants gp
      JOIN users u ON gp.user_id = u.id
      WHERE gp.game_id = ?
      ORDER BY gp.role, u.first_name, u.last_name
    `,
      [gameId]
    );
  }

  /**
   * Get total count of games
   * @returns {Promise<number>} Total number of games
   */
  async getGameCount() {
    const result = await db.get('SELECT COUNT(*) as count FROM pickem_games');
    return result ? result.count : 0;
  }

  /**
   * Get all games with admin details (for admin management)
   * @returns {Promise<Array>} Games with commissioner, season, participant details
   */
  async getAllGamesWithDetails() {
    return await db.all(`
      SELECT
        g.*,
        COALESCE(g.game_name, 'Unnamed Game') as name,
        u.first_name || ' ' || u.last_name as commissioner_name,
        s.season as season_year,
        s.is_current as season_is_current,
        COUNT(DISTINCT gp.id) as participant_count
      FROM pickem_games g
      LEFT JOIN users u ON g.commissioner_id = u.id
      LEFT JOIN seasons s ON g.season_id = s.id
      LEFT JOIN game_participants gp ON g.id = gp.game_id
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `);
  }

  /**
   * Update game season
   * @param {string} gameId - Game ID
   * @param {string} seasonId - New season ID
   * @returns {Promise<void>}
   */
  async updateGameSeason(gameId, seasonId) {
    await db.run(`
      UPDATE pickem_games
      SET season_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [seasonId, gameId]);
  }

  /**
   * Update game status (active/inactive)
   * @param {string} gameId - Game ID
   * @param {boolean} isActive - Active status
   * @returns {Promise<void>}
   */
  async updateGameStatus(gameId, isActive) {
    await db.run(`
      UPDATE pickem_games
      SET is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [isActive ? 1 : 0, gameId]);
  }

  /**
   * Get all games (basic information)
   * @returns {Promise<Array>} All games
   */
  async getAllGames() {
    return await db.all('SELECT * FROM pickem_games ORDER BY created_at DESC');
  }

  /**
   * Update game data with provided fields
   * @param {string} gameId - Game ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updateGameData(gameId, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    
    await db.run(
      `UPDATE pickem_games
       SET ${setClause}, updated_at = datetime('now')
       WHERE id = ?`,
      [...values, gameId]
    );
  }

  /**
   * Migrate game data (SQLite specific)
   * @returns {Promise<void>}
   */
  async migrateGameData() {
    // Update games with NULL game_name
    await db.run(`
      UPDATE pickem_games
      SET game_name = CASE
        WHEN type = 'weekly' AND weekly_week IS NOT NULL THEN 'Week ' || weekly_week || ' Picks'
        WHEN type = 'survivor' THEN 'Survivor Pool'
        ELSE 'Pick''em Game'
      END
      WHERE game_name IS NULL OR game_name = ''
    `);

    // Update games with NULL is_active - set to active by default
    await db.run(`
      UPDATE pickem_games
      SET is_active = 1
      WHERE is_active IS NULL
    `);
  }

  /**
   * Update commissioner for games without commissioner
   * @param {string} userId - User ID to set as commissioner
   * @returns {Promise<void>}
   */
  async updateCommissionerForGamesWithoutCommissioner(userId) {
    await db.run(
      `UPDATE pickem_games
       SET commissioner_id = ?
       WHERE commissioner_id IS NULL OR commissioner_id = ''`,
      [userId]
    );
  }
}