import { v4 as uuidv4 } from 'uuid';
import IInvitationService from '../interfaces/IInvitationService.js';
import db from '../../../models/database.js';

/**
 * SQLite Invitation Service Implementation
 */
export default class SQLiteInvitationService extends IInvitationService {
  constructor() {
    super();
    this.db = db; // Use the singleton database instance
  }

  /**
   * Get all pending invitations
   * @returns {Promise<Array>} Pending invitations with game and inviter details
   */
  async getPendingInvitations() {
    const invitations = await this.db.all(`
      SELECT
        gi.id,
        gi.email,
        gi.status,
        gi.expires_at,
        gi.created_at,
        g.game_name as game_name,
        u.first_name || ' ' || u.last_name as invited_by_name
      FROM game_invitations gi
      LEFT JOIN pickem_games g ON gi.game_id = g.id
      LEFT JOIN users u ON gi.invited_by_user_id = u.id
      WHERE gi.status = 'pending' AND gi.expires_at > datetime('now')
      ORDER BY gi.created_at DESC
    `);

    return invitations;
  }

  /**
   * Get invitation by ID
   * @param {string} invitationId - Invitation ID
   * @returns {Promise<Object|null>} Invitation data
   */
  async getInvitationById(invitationId) {
    const invitation = await this.db.get(
      "SELECT * FROM game_invitations WHERE id = ?",
      [invitationId]
    );
    
    return invitation || null;
  }

  /**
   * Get invitation by token
   * @param {string} inviteToken - Invitation token
   * @returns {Promise<Object|null>} Invitation data with game info
   */
  async getInvitationByToken(inviteToken) {
    const invitation = await this.db.get(`
      SELECT gi.*, pg.game_name
      FROM game_invitations gi
      JOIN pickem_games pg ON gi.game_id = pg.id
      WHERE gi.invite_token = ? AND gi.status = 'pending' AND gi.expires_at > datetime('now')
    `, [inviteToken]);

    return invitation || null;
  }

  /**
   * Check if invitation exists for email and game
   * @param {string} gameId - Game ID
   * @param {string} email - Email address
   * @returns {Promise<Object|null>} Existing pending invitation
   */
  async checkExistingInvitation(gameId, email) {
    const invitation = await this.db.get(`
      SELECT * FROM game_invitations
      WHERE game_id = ? AND email = ? AND status = 'pending'
    `, [gameId, email.toLowerCase()]);

    return invitation || null;
  }

  /**
   * Create a new invitation
   * @param {Object} invitationData - Invitation data
   * @returns {Promise<Object>} Created invitation
   */
  async createInvitation(invitationData) {
    const {
      gameId,
      email,
      invitedByUserId,
      inviteToken,
      expiresAt
    } = invitationData;

    const invitationId = uuidv4();

    await this.db.run(`
      INSERT INTO game_invitations (id, game_id, email, invited_by_user_id, invite_token, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      invitationId,
      gameId,
      email.toLowerCase(),
      invitedByUserId,
      inviteToken,
      expiresAt
    ]);

    return await this.getInvitationById(invitationId);
  }

  /**
   * Update invitation status
   * @param {string} invitationId - Invitation ID
   * @param {string} status - New status (accepted, cancelled, etc.)
   * @returns {Promise<void>}
   */
  async updateInvitationStatus(invitationId, status) {
    await this.db.run(`
      UPDATE game_invitations
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [status, invitationId]);
  }

  /**
   * Cancel invitation
   * @param {string} invitationId - Invitation ID
   * @returns {Promise<Object>} Cancelled invitation info
   */
  async cancelInvitation(invitationId) {
    // Get invitation info before cancelling
    const invitation = await this.getInvitationById(invitationId);
    if (!invitation) {
      throw new Error('Invitation not found');
    }

    await this.updateInvitationStatus(invitationId, 'cancelled');

    return invitation;
  }

  /**
   * Delete invitations by game ID
   * @param {string} gameId - Game ID
   * @returns {Promise<void>}
   */
  async deleteInvitationsByGameId(gameId) {
    await this.db.run("DELETE FROM game_invitations WHERE game_id = ?", [gameId]);
  }

  /**
   * Delete invitations by user ID or email
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {Promise<void>}
   */
  async deleteInvitationsByUser(userId, email) {
    await this.db.run(
      "DELETE FROM game_invitations WHERE invited_by_user_id = ? OR email = ?", 
      [userId, email.toLowerCase()]
    );
  }

  /**
   * Get pending invitations for a game
   * @param {string} gameId - Game ID
   * @returns {Promise<Array>} Pending invitations for the game
   */
  async getGameInvitations(gameId) {
    const invitations = await this.db.all(`
      SELECT * FROM game_invitations 
      WHERE game_id = ? AND status = 'pending' 
      ORDER BY created_at DESC
    `, [gameId]);

    return invitations;
  }
}