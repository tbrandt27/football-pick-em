import IUserService from '../interfaces/IUserService.js';
import db from '../../../models/database.js';

/**
 * DynamoDB User Service Implementation
 */
export default class DynamoDBUserService extends IUserService {
  /**
   * Get all users (admin only)
   * @returns {Promise<Array>} Users with team info
   */
  async getAllUsers() {
    // Scan users table
    const users = await db.all({
      action: 'scan',
      table: 'users'
    });

    // For each user, get team information if they have a favorite team
    const usersWithTeams = await Promise.all(
      users.map(async (user) => {
        if (user.favorite_team_id) {
          try {
            const team = await db.get({
              action: 'get',
              table: 'football_teams',
              key: { id: user.favorite_team_id }
            });
            
            return {
              ...user,
              favorite_team_name: team?.team_name || null,
              favorite_team_city: team?.team_city || null
            };
          } catch (error) {
            console.warn(`Could not fetch team for user ${user.id}:`, error);
            return {
              ...user,
              favorite_team_name: null,
              favorite_team_city: null
            };
          }
        }
        
        return {
          ...user,
          favorite_team_name: null,
          favorite_team_city: null
        };
      })
    );

    // Sort by created_at DESC (DynamoDB doesn't support ORDER BY)
    return usersWithTeams.sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    });
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User with team info
   */
  async getUserById(userId) {
    const user = await db.get({
      action: 'get',
      table: 'users',
      key: { id: userId }
    });

    if (!user) {
      return null;
    }

    // Get team information if user has a favorite team
    if (user.favorite_team_id) {
      try {
        const team = await db.get({
          action: 'get',
          table: 'football_teams',
          key: { id: user.favorite_team_id }
        });
        
        return {
          ...user,
          favorite_team_name: team?.team_name || null,
          favorite_team_city: team?.team_city || null
        };
      } catch (error) {
        console.warn(`Could not fetch team for user ${userId}:`, error);
      }
    }

    return {
      ...user,
      favorite_team_name: null,
      favorite_team_city: null
    };
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User data
   */
  async getUserByEmail(email) {
    // DynamoDB doesn't have a secondary index on email in this implementation
    // We need to scan the table - in production, you'd want a GSI on email
    const result = await db.all({
      action: 'scan',
      table: 'users',
      conditions: { email: email.toLowerCase() }
    });

    return result && result.length > 0 ? result[0] : null;
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user
   */
  async createUser(userData) {
    const {
      id,
      email,
      password,
      firstName,
      lastName,
      favoriteTeamId,
      emailVerificationToken,
      emailVerified = false
    } = userData;

    const now = new Date().toISOString();
    const userItem = {
      id,
      email: email.toLowerCase(),
      password,
      first_name: firstName,
      last_name: lastName,
      favorite_team_id: favoriteTeamId || null,
      email_verification_token: emailVerificationToken,
      email_verified: emailVerified,
      is_admin: false,
      created_at: now,
      updated_at: now
    };

    await db.run({
      action: 'put',
      table: 'users',
      item: userItem
    });

    return await this.getUserById(id);
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated user
   */
  async updateUser(userId, updates) {
    const { firstName, lastName, favoriteTeamId } = updates;

    await db.run({
      action: 'update',
      table: 'users',
      key: { id: userId },
      item: {
        first_name: firstName,
        last_name: lastName,
        favorite_team_id: favoriteTeamId || null,
        updated_at: new Date().toISOString()
      }
    });

    return await this.getUserById(userId);
  }

  /**
   * Update user admin status
   * @param {string} userId - User ID
   * @param {boolean} isAdmin - Admin status
   * @returns {Promise<void>}
   */
  async updateAdminStatus(userId, isAdmin) {
    await db.run({
      action: 'update',
      table: 'users',
      key: { id: userId },
      item: {
        is_admin: isAdmin,
        updated_at: new Date().toISOString()
      }
    });
  }

  /**
   * Update user's last login timestamp
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async updateLastLogin(userId) {
    await db.run({
      action: 'update',
      table: 'users',
      key: { id: userId },
      item: {
        last_login: new Date().toISOString()
      }
    });
  }

  /**
   * Get user's game participation
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Games with participation info
   */
  async getUserGames(userId) {
    // Get user's game participations
    const participations = await db.all({
      action: 'scan',
      table: 'game_participants',
      conditions: { user_id: userId }
    });

    if (!participations || participations.length === 0) {
      return [];
    }

    // Get game details for each participation
    const gamesWithDetails = await Promise.all(
      participations.map(async (participation) => {
        try {
          const game = await db.get({
            action: 'get',
            table: 'pickem_games',
            key: { id: participation.game_id }
          });

          if (!game) {
            return null;
          }

          // Get player count for this game
          const allParticipants = await db.all({
            action: 'scan',
            table: 'game_participants',
            conditions: { game_id: participation.game_id }
          });

          const playerCount = allParticipants.filter(p => p.role === 'player').length;

          return {
            id: game.id,
            game_name: game.game_name,
            game_type: game.type || 'weekly',
            created_at: game.created_at,
            role: participation.role,
            player_count: playerCount
          };
        } catch (error) {
          console.warn(`Could not fetch game ${participation.game_id}:`, error);
          return null;
        }
      })
    );

    // Filter out null results and sort by created_at DESC
    return gamesWithDetails
      .filter(game => game !== null)
      .sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
  }

  /**
   * Delete user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Deleted user info
   */
  async deleteUser(userId) {
    // Get user info before deletion
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await db.run({
      action: 'delete',
      table: 'users',
      key: { id: userId }
    });

    return user;
  }

  /**
   * Set password reset token
   * @param {string} userId - User ID
   * @param {string} resetToken - Reset token
   * @param {Date} expiresAt - Token expiration
   * @returns {Promise<void>}
   */
  async setPasswordResetToken(userId, resetToken, expiresAt) {
    await db.run({
      action: 'update',
      table: 'users',
      key: { id: userId },
      item: {
        password_reset_token: resetToken,
        password_reset_expires: expiresAt.toISOString()
      }
    });
  }

  /**
   * Get user by password reset token
   * @param {string} resetToken - Reset token
   * @returns {Promise<Object|null>} User if token valid
   */
  async getUserByResetToken(resetToken) {
    // Scan for user with this reset token that hasn't expired
    const result = await db.all({
      action: 'scan',
      table: 'users',
      conditions: { password_reset_token: resetToken }
    });

    if (!result || result.length === 0) {
      return null;
    }

    const user = result[0];
    const now = new Date();
    const expiresAt = new Date(user.password_reset_expires);

    // Check if token is still valid
    if (expiresAt > now) {
      return { id: user.id };
    }

    return null;
  }

  /**
   * Reset user password
   * @param {string} userId - User ID
   * @param {string} hashedPassword - New hashed password
   * @returns {Promise<void>}
   */
  async resetPassword(userId, hashedPassword) {
    await db.run({
      action: 'update',
      table: 'users',
      key: { id: userId },
      item: {
        password: hashedPassword,
        password_reset_token: null,
        password_reset_expires: null
      }
    });
  }

  /**
   * Check if user exists by email
   * @param {string} email - User email
   * @returns {Promise<boolean>} True if user exists
   */
  async userExists(email) {
    const user = await this.getUserByEmail(email);
    return !!user;
  }

  /**
   * Get first admin user
   * @returns {Promise<Object|null>} First admin user
   */
  async getFirstAdminUser() {
    const result = await db.all({
      action: 'scan',
      table: 'users',
      conditions: { is_admin: true }
    });

    return result && result.length > 0 ? result[0] : null;
  }

  /**
   * Get any user (fallback for operations)
   * @returns {Promise<Object|null>} Any user
   */
  async getAnyUser() {
    const result = await db.all({
      action: 'scan',
      table: 'users'
    });

    return result && result.length > 0 ? result[0] : null;
  }

  /**
   * Dynamic user profile update (for auth routes)
   * @param {string} userId - User ID
   * @param {Object} updates - Dynamic updates object
   * @returns {Promise<Object>} Updated user
   */
  async updateUserDynamic(userId, updates) {
    const updateItem = {};

    if (updates.firstName !== undefined) {
      updateItem.first_name = updates.firstName;
    }
    if (updates.lastName !== undefined) {
      updateItem.last_name = updates.lastName;
    }
    if (updates.favoriteTeamId !== undefined) {
      updateItem.favorite_team_id = updates.favoriteTeamId;
    }

    if (Object.keys(updateItem).length === 0) {
      throw new Error('No valid fields to update');
    }

    updateItem.updated_at = new Date().toISOString();

    await db.run({
      action: 'update',
      table: 'users',
      key: { id: userId },
      item: updateItem
    });

    // Return updated user data - convert to format expected by auth routes
    const user = await db.get({
      action: 'get',
      table: 'users',
      key: { id: userId }
    });

    return user;
  }

  /**
   * Get user count
   * @returns {Promise<number>} Total number of users
   */
  async getUserCount() {
    const result = await db.all({
      action: 'scan',
      table: 'users'
    });
    return result ? result.length : 0;
  }

  /**
   * Get user basic info by ID (for admin operations)
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User basic info (name, email)
   */
  async getUserBasicInfo(userId) {
    const user = await db.get({
      action: 'get',
      table: 'users',
      key: { id: userId }
    });

    if (!user) {
      return null;
    }

    return {
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email
    };
  }
}