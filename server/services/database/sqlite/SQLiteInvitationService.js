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
        gi.is_admin_invitation,
        CASE
          WHEN gi.is_admin_invitation = 1 THEN 'Admin Invitation'
          ELSE g.game_name
        END as game_name,
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
      SELECT gi.*,
             CASE
               WHEN gi.is_admin_invitation = 1 THEN 'Admin Invitation'
               ELSE pg.game_name
             END as game_name
      FROM game_invitations gi
      LEFT JOIN pickem_games pg ON gi.game_id = pg.id
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
      expiresAt,
      isAdminInvitation = false
    } = invitationData;

    const invitationId = uuidv4();

    await this.db.run(`
      INSERT INTO game_invitations (id, game_id, email, invited_by_user_id, invite_token, expires_at, is_admin_invitation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      invitationId,
      gameId || null,
      email.toLowerCase(),
      invitedByUserId,
      inviteToken,
      expiresAt,
      isAdminInvitation ? 1 : 0
    ]);

    return await this.getInvitationById(invitationId);
  }

  /**
   * Create an admin-only invitation (no game required)
   * @param {Object} invitationData - Invitation data
   * @returns {Promise<Object>} Created invitation
   */
  async createAdminInvitation(invitationData) {
    const {
      email,
      invitedByUserId,
      inviteToken,
      expiresAt
    } = invitationData;

    const invitationId = uuidv4();

    await this.db.run(`
      INSERT INTO game_invitations (id, game_id, email, invited_by_user_id, invite_token, expires_at, is_admin_invitation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      invitationId,
      null, // No game for admin invitations
      email.toLowerCase(),
      invitedByUserId,
      inviteToken,
      expiresAt,
      1 // Mark as admin invitation
    ]);

    return await this.getInvitationById(invitationId);
  }

  /**
   * Check if invitation exists for email (for admin invitations)
   * @param {string} email - Email address
   * @returns {Promise<Object|null>} Existing pending admin invitation
   */
  async checkExistingAdminInvitation(email) {
    const invitation = await this.db.get(`
      SELECT * FROM game_invitations
      WHERE email = ? AND status = 'pending' AND is_admin_invitation = 1
    `, [email.toLowerCase()]);

    return invitation || null;
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