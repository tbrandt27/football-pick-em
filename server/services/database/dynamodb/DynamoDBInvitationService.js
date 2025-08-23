import { v4 as uuidv4 } from 'uuid';
import IInvitationService from '../interfaces/IInvitationService.js';
import db from '../../../models/database.js';

/**
 * DynamoDB Invitation Service Implementation
 */
export default class DynamoDBInvitationService extends IInvitationService {
  constructor() {
    super();
    this.db = db.provider; // Use the singleton database provider
  }

  /**
   * Get all pending invitations
   * @returns {Promise<Array>} Pending invitations with game and inviter details
   */
  async getPendingInvitations() {
    // Scan for pending invitations that haven't expired
    const now = new Date().toISOString();
    const invitationsResult = await this.db._dynamoScan('game_invitations');
    
    if (!invitationsResult.Items) {
      return [];
    }

    // Filter pending and non-expired invitations in JavaScript since DynamoDB doesn't support complex WHERE clauses in Scan
    const pendingInvitations = invitationsResult.Items.filter(invitation =>
      invitation.status === 'pending' && invitation.expires_at > now
    );

    // For each invitation, get game and user info
    const invitationsWithDetails = await Promise.all(
      pendingInvitations.map(async (invitation) => {
        let game_name = 'Admin Invitation';
        let invited_by_name = 'Unknown User';

        try {
          // Check if this is an admin invitation
          if (invitation.is_admin_invitation) {
            game_name = 'Admin Invitation';
          } else if (invitation.game_id) {
            // Get game info for regular invitations
            const gameResult = await this.db._dynamoGet('pickem_games', { id: invitation.game_id });
            if (gameResult.Item) {
              game_name = gameResult.Item.game_name;
            } else {
              game_name = 'Unknown Game';
            }
          }

          // Get inviter info
          const userResult = await this.db._dynamoGet('users', { id: invitation.invited_by_user_id });
          if (userResult.Item) {
            invited_by_name = `${userResult.Item.first_name} ${userResult.Item.last_name}`;
          }
        } catch (error) {
          console.warn(`Could not fetch details for invitation ${invitation.id}:`, error);
        }

        return {
          ...invitation,
          game_name,
          invited_by_name
        };
      })
    );

    // Sort by created_at DESC
    return invitationsWithDetails.sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }

  /**
   * Get invitation by ID
   * @param {string} invitationId - Invitation ID
   * @returns {Promise<Object|null>} Invitation data
   */
  async getInvitationById(invitationId) {
    const result = await this.db._dynamoGet('game_invitations', { id: invitationId });
    return result.Item || null;
  }

  /**
   * Get invitation by token
   * @param {string} inviteToken - Invitation token
   * @returns {Promise<Object|null>} Invitation data with game info
   */
  async getInvitationByToken(inviteToken) {
    // Scan for invitation with this token
    const result = await this.db._dynamoScan('game_invitations', { invite_token: inviteToken });
    
    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    const invitation = result.Items[0];

    // Get game information
    try {
      const gameResult = await this.db._dynamoGet('pickem_games', { id: invitation.game_id });
      if (gameResult.Item) {
        invitation.game_name = gameResult.Item.game_name;
      }
    } catch (error) {
      console.warn(`Could not fetch game for invitation ${invitation.id}:`, error);
    }

    return invitation;
  }

  /**
   * Check if invitation exists for email and game
   * @param {string} gameId - Game ID
   * @param {string} email - Email address
   * @returns {Promise<Object|null>} Existing pending invitation
   */
  async checkExistingInvitation(gameId, email) {
    // Scan for existing invitation
    const result = await this.db._dynamoScan('game_invitations');
    
    if (!result.Items) {
      return null;
    }

    // Filter for this game, email, and pending status
    const existingInvitation = result.Items.find(invitation => 
      invitation.game_id === gameId && 
      invitation.email === email.toLowerCase() && 
      invitation.status === 'pending'
    );

    return existingInvitation || null;
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
    const now = new Date().toISOString();

    const invitationItem = {
      id: invitationId,
      game_id: gameId || null,
      email: email.toLowerCase(),
      invited_by_user_id: invitedByUserId,
      invite_token: inviteToken,
      status: 'pending',
      expires_at: expiresAt,
      is_admin_invitation: isAdminInvitation,
      created_at: now,
      updated_at: now
    };

    await this.db._dynamoPut('game_invitations', invitationItem);

    return invitationItem;
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
    const now = new Date().toISOString();

    const invitationItem = {
      id: invitationId,
      game_id: null, // No game for admin invitations
      email: email.toLowerCase(),
      invited_by_user_id: invitedByUserId,
      invite_token: inviteToken,
      status: 'pending',
      expires_at: expiresAt,
      is_admin_invitation: true,
      created_at: now,
      updated_at: now
    };

    await this.db._dynamoPut('game_invitations', invitationItem);

    return invitationItem;
  }

  /**
   * Check if invitation exists for email (for admin invitations)
   * @param {string} email - Email address
   * @returns {Promise<Object|null>} Existing pending admin invitation
   */
  async checkExistingAdminInvitation(email) {
    // Scan for existing admin invitation
    const result = await this.db._dynamoScan('game_invitations');
    
    if (!result.Items) {
      return null;
    }

    // Filter for this email, pending status, and admin invitation
    const existingInvitation = result.Items.find(invitation =>
      invitation.email === email.toLowerCase() &&
      invitation.status === 'pending' &&
      invitation.is_admin_invitation === true
    );

    return existingInvitation || null;
  }

  /**
   * Update invitation status
   * @param {string} invitationId - Invitation ID
   * @param {string} status - New status (accepted, cancelled, etc.)
   * @returns {Promise<void>}
   */
  async updateInvitationStatus(invitationId, status) {
    await this.db._dynamoUpdate('game_invitations', { id: invitationId }, {
      status: status,
      updated_at: new Date().toISOString()
    });
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
    // Scan for invitations for this game
    const result = await this.db._dynamoScan('game_invitations', { game_id: gameId });
    
    if (result.Items) {
      // Delete each invitation individually (DynamoDB requirement)
      for (const invitation of result.Items) {
        await this.db._dynamoDelete('game_invitations', { id: invitation.id });
      }
    }
  }

  /**
   * Delete invitations by user ID or email
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {Promise<void>}
   */
  async deleteInvitationsByUser(userId, email) {
    // Scan all invitations
    const result = await this.db._dynamoScan('game_invitations');
    
    if (result.Items) {
      // Filter invitations to delete
      const invitationsToDelete = result.Items.filter(invitation => 
        invitation.invited_by_user_id === userId || invitation.email === email.toLowerCase()
      );
      
      // Delete each invitation individually
      for (const invitation of invitationsToDelete) {
        await this.db._dynamoDelete('game_invitations', { id: invitation.id });
      }
    }
  }

  /**
   * Get pending invitations for a game
   * @param {string} gameId - Game ID
   * @returns {Promise<Array>} Pending invitations for the game
   */
  async getGameInvitations(gameId) {
    // Scan for invitations for this game
    const result = await this.db._dynamoScan('game_invitations', { game_id: gameId });
    
    if (!result.Items) {
      return [];
    }

    // Filter for pending invitations
    const pendingInvitations = result.Items.filter(invitation => 
      invitation.status === 'pending'
    );

    // Sort by created_at DESC
    return pendingInvitations.sort((a, b) => 
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }
}