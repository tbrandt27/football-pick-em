/**
 * Interface for Invitation Service
 * Defines methods for managing game invitations across different database providers
 */
export default class IInvitationService {
  
  /**
   * Get all pending invitations
   * @returns {Promise<Array>} Pending invitations with game and inviter details
   */
  async getPendingInvitations() {
    throw new Error('getPendingInvitations must be implemented');
  }

  /**
   * Get invitation by ID
   * @param {string} invitationId - Invitation ID
   * @returns {Promise<Object|null>} Invitation data
   */
  async getInvitationById(invitationId) {
    throw new Error('getInvitationById must be implemented');
  }

  /**
   * Get invitation by token
   * @param {string} inviteToken - Invitation token
   * @returns {Promise<Object|null>} Invitation data with game info
   */
  async getInvitationByToken(inviteToken) {
    throw new Error('getInvitationByToken must be implemented');
  }

  /**
   * Check if invitation exists for email and game
   * @param {string} gameId - Game ID
   * @param {string} email - Email address
   * @returns {Promise<Object|null>} Existing pending invitation
   */
  async checkExistingInvitation(gameId, email) {
    throw new Error('checkExistingInvitation must be implemented');
  }

  /**
   * Create a new invitation
   * @param {Object} invitationData - Invitation data
   * @returns {Promise<Object>} Created invitation
   */
  async createInvitation(invitationData) {
    throw new Error('createInvitation must be implemented');
  }

  /**
   * Update invitation status
   * @param {string} invitationId - Invitation ID
   * @param {string} status - New status (accepted, cancelled, etc.)
   * @returns {Promise<void>}
   */
  async updateInvitationStatus(invitationId, status) {
    throw new Error('updateInvitationStatus must be implemented');
  }

  /**
   * Cancel invitation
   * @param {string} invitationId - Invitation ID
   * @returns {Promise<Object>} Cancelled invitation info
   */
  async cancelInvitation(invitationId) {
    throw new Error('cancelInvitation must be implemented');
  }

  /**
   * Delete invitations by game ID
   * @param {string} gameId - Game ID
   * @returns {Promise<void>}
   */
  async deleteInvitationsByGameId(gameId) {
    throw new Error('deleteInvitationsByGameId must be implemented');
  }

  /**
   * Delete invitations by user ID or email
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {Promise<void>}
   */
  async deleteInvitationsByUser(userId, email) {
    throw new Error('deleteInvitationsByUser must be implemented');
  }

  /**
   * Get pending invitations for a game
   * @param {string} gameId - Game ID
   * @returns {Promise<Array>} Pending invitations for the game
   */
  async getGameInvitations(gameId) {
    throw new Error('getGameInvitations must be implemented');
  }
}