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
    console.log(`[DynamoDBInvitationService] getInvitationByToken called with token:`, {
      token: inviteToken,
      tokenType: typeof inviteToken,
      tokenLength: inviteToken?.length,
      tokenDefined: !!inviteToken
    });

    // Validate invitation token
    if (!inviteToken || typeof inviteToken !== 'string') {
      console.warn(`[DynamoDBInvitationService] Invalid invite token provided:`, {
        token: inviteToken,
        type: typeof inviteToken
      });
      return null;
    }

    try {
      // Use GSI invite_token-index for efficient lookup
      console.log(`[DynamoDBInvitationService] Querying for invitation with token: ${inviteToken}`);
      const invitation = await this.db._getByInviteTokenGSI('game_invitations', inviteToken);
      
      if (!invitation) {
        console.log(`[DynamoDBInvitationService] No invitation found for token: ${inviteToken}`);
        return null;
      }
      console.log(`[DynamoDBInvitationService] Found invitation:`, {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        gameId: invitation.game_id,
        isAdminInvitation: invitation.is_admin_invitation
      });

      // Get game information only if it's not an admin invitation
      if (!invitation.is_admin_invitation && invitation.game_id) {
        try {
          console.log(`[DynamoDBInvitationService] Fetching game info for ID: ${invitation.game_id}`);
          const gameResult = await this.db._dynamoGet('pickem_games', { id: invitation.game_id });
          if (gameResult.Item) {
            invitation.game_name = gameResult.Item.game_name;
            console.log(`[DynamoDBInvitationService] Game name found: ${invitation.game_name}`);
          } else {
            console.warn(`[DynamoDBInvitationService] Game not found for ID: ${invitation.game_id}`);
          }
        } catch (error) {
          console.warn(`[DynamoDBInvitationService] Could not fetch game for invitation ${invitation.id}:`, error);
        }
      } else if (invitation.is_admin_invitation) {
        invitation.game_name = 'Admin Invitation';
      }

      return invitation;
    } catch (error) {
      console.error(`[DynamoDBInvitationService] Error in getInvitationByToken:`, error);
      throw error;
    }
  }

  /**
   * Check if invitation exists for email and game
   * @param {string} gameId - Game ID
   * @param {string} email - Email address
   * @returns {Promise<Object|null>} Existing pending invitation
   */
  async checkExistingInvitation(gameId, email) {
    try {
      // Use composite GSI game_email-index for efficient lookup
      const compositeKey = this.db._createCompositeKey(gameId, email.toLowerCase());
      const result = await this.db._dynamoQueryGSI('game_invitations', 'game_email-index', {
        game_email: compositeKey
      });

      // Find pending invitation
      const pendingInvitation = (result.Items || []).find(invitation =>
        invitation.status === 'pending'
      );

      return pendingInvitation || null;
    } catch (error) {
      // Handle missing GSI error - fallback to game_id-index GSI and filter
      if (error.code === 'ValidationException' && error.message.includes('game_email-index')) {
        console.warn(`[DynamoDBInvitationService] GSI 'game_email-index' not found, falling back to game_id-index for game ${gameId}`);
        
        // Fallback: Use game_id-index GSI and filter for email
        const gameInvitations = await this.db._getByGameIdGSI('game_invitations', gameId);
        
        if (!gameInvitations || gameInvitations.length === 0) {
          return null;
        }
        
        // Find the pending invitation for this specific email
        const pendingInvitation = gameInvitations.find(invitation =>
          invitation.email === email.toLowerCase() && invitation.status === 'pending'
        );
        return pendingInvitation || null;
      }
      
      // Re-throw other errors
      throw error;
    }
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

    const emailLower = email.toLowerCase();
    const invitationItem = {
      id: invitationId,
      game_id: gameId || null,
      email: emailLower,
      invited_by_user_id: invitedByUserId,
      invite_token: inviteToken,
      status: 'pending',
      expires_at: expiresAt,
      is_admin_invitation: isAdminInvitation,
      // Add composite key for GSI
      game_email: gameId ? `${gameId}:${emailLower}` : `admin:${emailLower}`,
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

    const emailLower = email.toLowerCase();
    const invitationItem = {
      id: invitationId,
      game_id: null, // No game for admin invitations
      email: emailLower,
      invited_by_user_id: invitedByUserId,
      invite_token: inviteToken,
      status: 'pending',
      expires_at: expiresAt,
      is_admin_invitation: true,
      // Add composite key for GSI
      game_email: `admin:${emailLower}`,
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
    try {
      // Use composite GSI game_email-index for admin invitations
      const compositeKey = this.db._createCompositeKey('admin', email.toLowerCase());
      const result = await this.db._dynamoQueryGSI('game_invitations', 'game_email-index', {
        game_email: compositeKey
      });

      // Find pending admin invitation
      const pendingInvitation = (result.Items || []).find(invitation =>
        invitation.status === 'pending' &&
        invitation.is_admin_invitation === true
      );

      return pendingInvitation || null;
    } catch (error) {
      // Handle missing GSI error - fallback to scan with email filter
      if (error.code === 'ValidationException' && error.message.includes('game_email-index')) {
        console.warn(`[DynamoDBInvitationService] GSI 'game_email-index' not found, falling back to scan for admin invitation ${email}`);
        
        // Fallback: Scan all invitations and filter for admin invitations with this email
        const scanResult = await this.db._dynamoScan('game_invitations');
        
        if (!scanResult.Items || scanResult.Items.length === 0) {
          return null;
        }
        
        // Find pending admin invitation for this email
        const pendingInvitation = scanResult.Items.find(invitation =>
          invitation.email === email.toLowerCase() &&
          invitation.status === 'pending' &&
          invitation.is_admin_invitation === true
        );
        return pendingInvitation || null;
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Update invitation status
   * @param {string} invitationId - Invitation ID
   * @param {string} status - New status (accepted, cancelled, etc.)
   * @returns {Promise<void>}
   */
  async updateInvitationStatus(invitationId, status) {
    // First get the invitation to ensure we have all the data
    const invitation = await this.getInvitationById(invitationId);
    if (!invitation) {
      throw new Error('Invitation not found');
    }
    
    await this.db._dynamoUpdate('game_invitations', { id: invitationId }, {
      status: status
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
    // Use GSI game_id-index for efficient lookup
    const invitations = await this.db._getByGameIdGSI('game_invitations', gameId);
    
    if (invitations) {
      // Delete each invitation individually (DynamoDB requirement)
      for (const invitation of invitations) {
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
    // Use GSI game_id-index for efficient lookup
    const invitations = await this.db._getByGameIdGSI('game_invitations', gameId);
    
    if (!invitations) {
      return [];
    }

    // Filter for pending invitations
    const pendingInvitations = invitations.filter(invitation =>
      invitation.status === 'pending'
    );

    // Sort by created_at DESC
    return pendingInvitations.sort((a, b) =>
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
  }
}