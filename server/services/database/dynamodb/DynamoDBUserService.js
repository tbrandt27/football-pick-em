import IUserService from '../interfaces/IUserService.js';
import db from '../../../models/database.js';

/**
 * DynamoDB User Service Implementation
 */
export default class DynamoDBUserService extends IUserService {
  constructor() {
    super();
    this.db = db.provider; // Use the singleton database provider
  }
  /**
   * Get all users (admin only)
   * @returns {Promise<Array>} Users with team info
   */
  async getAllUsers() {
    // Scan users table
    const usersResult = await this.db._dynamoScan('users');
    const users = usersResult.Items || [];

    // For each user, get team information if they have a favorite team
    const usersWithTeams = await Promise.all(
      users.map(async (user) => {
        if (user.favorite_team_id) {
          try {
            const teamResult = await this.db._dynamoGet('football_teams', { id: user.favorite_team_id });
            const team = teamResult.Item;
            
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
    const userResult = await this.db._dynamoGet('users', { id: userId });
    const user = userResult.Item;

    if (!user) {
      return null;
    }

    // Get team information if user has a favorite team
    if (user.favorite_team_id) {
      try {
        const teamResult = await this.db._dynamoGet('football_teams', { id: user.favorite_team_id });
        const team = teamResult.Item;
        
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
    try {
      // Try GSI email-index for efficient lookup
      return await this.db._getByEmailGSI('users', email);
    } catch (error) {
      // Fallback to scan if GSI doesn't exist (backward compatibility)
      if (error.name === 'ResourceNotFoundException' || error.name === 'ValidationException') {
        console.log(`[DynamoDB User] GSI not found (${error.name}), falling back to scan for email ${email}`);
        const result = await this.db._dynamoScan('users', { email: email.toLowerCase() });
        return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
      }
      throw error;
    }
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
      emailVerified = false,
      isAdmin = false
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
      email_verified: emailVerified ? 'true' : 'false',
      is_admin: isAdmin ? 'true' : 'false',
      created_at: now,
      updated_at: now
    };

    await this.db._dynamoPut('users', userItem);

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

    await this.db._dynamoUpdate('users', { id: userId }, {
      first_name: firstName,
      last_name: lastName,
      favorite_team_id: favoriteTeamId || null
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
    await this.db._dynamoUpdate('users', { id: userId }, {
      is_admin: isAdmin ? 'true' : 'false'
    });
  }

  /**
   * Update user email verification status
   * @param {string} userId - User ID
   * @param {boolean} emailVerified - Email verification status
   * @returns {Promise<void>}
   */
  async updateEmailVerified(userId, emailVerified) {
    await this.db._dynamoUpdate('users', { id: userId }, {
      email_verified: emailVerified ? 'true' : 'false'
    });
  }

  /**
   * Update user's last login timestamp
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async updateLastLogin(userId) {
    await this.db._dynamoUpdate('users', { id: userId }, {
      last_login: new Date().toISOString()
    });
  }

  /**
   * Get user's game participation
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Games with participation info
   */
  async getUserGames(userId) {
    let participations;
    
    try {
      // Try GSI user_id-index for efficient lookup
      participations = await this.db._getByUserIdGSI('game_participants', userId);
    } catch (error) {
      // Fallback to scan if GSI doesn't exist (backward compatibility)
      if (error.name === 'ResourceNotFoundException' || error.name === 'ValidationException') {
        console.log(`[DynamoDB User] GSI not found (${error.name}), falling back to scan for user games ${userId}`);
        const participationsResult = await this.db._dynamoScan('game_participants', { user_id: userId });
        participations = participationsResult.Items || [];
      } else {
        throw error;
      }
    }

    if (!participations || participations.length === 0) {
      return [];
    }

    // Get game details for each participation
    const gamesWithDetails = await Promise.all(
      participations.map(async (participation) => {
        try {
          const gameResult = await this.db._dynamoGet('pickem_games', { id: participation.game_id });
          const game = gameResult.Item;

          if (!game) {
            return null;
          }

          // Try GSI game_id-index for efficient lookup
          let allParticipants;
          try {
            allParticipants = await this.db._getByGameIdGSI('game_participants', participation.game_id);
          } catch (error) {
            // Fallback to scan if GSI doesn't exist (backward compatibility)
            if (error.name === 'ResourceNotFoundException' || error.name === 'ValidationException') {
              console.log(`[DynamoDB User] GSI not found (${error.name}), falling back to scan for game participants ${participation.game_id}`);
              const allParticipantsResult = await this.db._dynamoScan('game_participants', { game_id: participation.game_id });
              allParticipants = allParticipantsResult.Items || [];
            } else {
              throw error;
            }
          }

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

    await this.db._dynamoDelete('users', { id: userId });

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
    await this.db._dynamoUpdate('users', { id: userId }, {
      password_reset_token: resetToken,
      password_reset_expires: expiresAt.toISOString()
    });
  }

  /**
   * Get user by password reset token
   * @param {string} resetToken - Reset token
   * @returns {Promise<Object|null>} User if token valid
   */
  async getUserByResetToken(resetToken) {
    // Note: For reset tokens, we still need to scan since there's no GSI for password_reset_token
    // This is acceptable since reset token lookups are infrequent
    const result = await this.db._dynamoScan('users', { password_reset_token: resetToken });

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    const user = result.Items[0];
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
    await this.db._dynamoUpdate('users', { id: userId }, {
      password: hashedPassword,
      password_reset_token: null,
      password_reset_expires: null
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
    try {
      // Try GSI is_admin-index for efficient lookup
      const result = await this.db._dynamoQueryGSI('users', 'is_admin-index', { is_admin: 'true' });
      return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
    } catch (error) {
      // Fallback to scan if GSI doesn't exist (backward compatibility)
      if (error.name === 'ResourceNotFoundException' || error.name === 'ValidationException') {
        console.log(`[DynamoDB User] GSI not found (${error.name}), falling back to scan for admin user`);
        const result = await this.db._dynamoScan('users', { is_admin: 'true' });
        return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
      }
      throw error;
    }
  }

  /**
   * Get any user (fallback for operations)
   * @returns {Promise<Object|null>} Any user
   */
  async getAnyUser() {
    const result = await this.db._dynamoScan('users');

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
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
      // DynamoDB needs null instead of undefined to clear the field
      updateItem.favorite_team_id = updates.favoriteTeamId || null;
    }

    if (Object.keys(updateItem).length === 0) {
      throw new Error('No valid fields to update');
    }

    await this.db._dynamoUpdate('users', { id: userId }, updateItem);

    // Return updated user data - convert to format expected by auth routes
    const userResult = await this.db._dynamoGet('users', { id: userId });
    const user = userResult.Item;

    return user;
  }

  /**
   * Get user count
   * @returns {Promise<number>} Total number of users
   */
  async getUserCount() {
    const result = await this.db._dynamoScan('users');
    return result.Items ? result.Items.length : 0;
  }

  /**
   * Get user basic info by ID (for admin operations)
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User basic info (name, email)
   */
  async getUserBasicInfo(userId) {
    const userResult = await this.db._dynamoGet('users', { id: userId });
    const user = userResult.Item;

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