import IUserService from '../interfaces/IUserService.js';
import db from '../../../models/database.js';

/**
 * SQLite User Service Implementation
 */
export default class SQLiteUserService extends IUserService {
  /**
   * Get all users (admin only)
   * @returns {Promise<Array>} Users with team info
   */
  async getAllUsers() {
    return await db.all(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.favorite_team_id,
        u.is_admin,
        u.email_verified,
        u.last_login,
        u.created_at,
        t.team_name as favorite_team_name,
        t.team_city as favorite_team_city
      FROM users u
      LEFT JOIN football_teams t ON u.favorite_team_id = t.id
      ORDER BY u.created_at DESC
    `);
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User with team info
   */
  async getUserById(userId) {
    return await db.get(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.favorite_team_id,
        u.is_admin,
        u.email_verified,
        u.last_login,
        u.created_at,
        t.team_name as favorite_team_name,
        t.team_city as favorite_team_city
      FROM users u
      LEFT JOIN football_teams t ON u.favorite_team_id = t.id
      WHERE u.id = ?
    `, [userId]);
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User data
   */
  async getUserByEmail(email) {
    return await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
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

    await db.run(`
      INSERT INTO users (
        id, email, password, first_name, last_name, favorite_team_id,
        email_verification_token, email_verified, is_admin, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      id,
      email.toLowerCase(),
      password,
      firstName,
      lastName,
      favoriteTeamId || null,
      emailVerificationToken,
      emailVerified ? 1 : 0,
      isAdmin ? 1 : 0
    ]);

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

    await db.run(`
      UPDATE users 
      SET first_name = ?, last_name = ?, favorite_team_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [firstName, lastName, favoriteTeamId || null, userId]);

    return await this.getUserById(userId);
  }

  /**
   * Update user admin status
   * @param {string} userId - User ID
   * @param {boolean} isAdmin - Admin status
   * @returns {Promise<void>}
   */
  async updateAdminStatus(userId, isAdmin) {
    await db.run(`
      UPDATE users 
      SET is_admin = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [isAdmin ? 1 : 0, userId]);
  }

  /**
   * Update user email verification status
   * @param {string} userId - User ID
   * @param {boolean} emailVerified - Email verification status
   * @returns {Promise<void>}
   */
  async updateEmailVerified(userId, emailVerified) {
    await db.run(`
      UPDATE users
      SET email_verified = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [emailVerified ? 1 : 0, userId]);
  }

  /**
   * Update user's last login timestamp
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async updateLastLogin(userId) {
    await db.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', [userId]);
  }

  /**
   * Get user's game participation
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Games with participation info
   */
  async getUserGames(userId) {
    return await db.all(`
      SELECT
        g.id,
        g.game_name,
        g.type as game_type,
        g.created_at,
        gp.role,
        COUNT(CASE WHEN gp2.role = 'player' THEN 1 END) as player_count
      FROM game_participants gp
      JOIN pickem_games g ON gp.game_id = g.id
      LEFT JOIN game_participants gp2 ON g.id = gp2.game_id
      WHERE gp.user_id = ?
      GROUP BY g.id, g.game_name, g.type, g.created_at, gp.role
      ORDER BY g.created_at DESC
    `, [userId]);
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

    await db.run('DELETE FROM users WHERE id = ?', [userId]);
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
    await db.run(`
      UPDATE users 
      SET password_reset_token = ?, password_reset_expires = ?
      WHERE id = ?
    `, [resetToken, expiresAt.toISOString(), userId]);
  }

  /**
   * Get user by password reset token
   * @param {string} resetToken - Reset token
   * @returns {Promise<Object|null>} User if token valid
   */
  async getUserByResetToken(resetToken) {
    return await db.get(`
      SELECT id FROM users 
      WHERE password_reset_token = ? AND password_reset_expires > datetime('now')
    `, [resetToken]);
  }

  /**
   * Reset user password
   * @param {string} userId - User ID
   * @param {string} hashedPassword - New hashed password
   * @returns {Promise<void>}
   */
  async resetPassword(userId, hashedPassword) {
    await db.run(`
      UPDATE users 
      SET password = ?, password_reset_token = NULL, password_reset_expires = NULL
      WHERE id = ?
    `, [hashedPassword, userId]);
  }

  /**
   * Check if user exists by email
   * @param {string} email - User email
   * @returns {Promise<boolean>} True if user exists
   */
  async userExists(email) {
    const user = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    return !!user;
  }

  /**
   * Get first admin user
   * @returns {Promise<Object|null>} First admin user
   */
  async getFirstAdminUser() {
    const adminUsers = await db.all('SELECT id FROM users WHERE is_admin = ? LIMIT 1', [true]);
    return adminUsers && adminUsers.length > 0 ? adminUsers[0] : null;
  }

  /**
   * Get any user (fallback for operations)
   * @returns {Promise<Object|null>} Any user
   */
  async getAnyUser() {
    const users = await db.all('SELECT id FROM users LIMIT 1');
    return users && users.length > 0 ? users[0] : null;
  }

  /**
   * Dynamic user profile update (for auth routes)
   * @param {string} userId - User ID
   * @param {Object} updates - Dynamic updates object
   * @returns {Promise<Object>} Updated user
   */
  async updateUserDynamic(userId, updates) {
    const updateFields = [];
    const values = [];

    if (updates.firstName !== undefined) {
      updateFields.push('first_name = ?');
      values.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      updateFields.push('last_name = ?');
      values.push(updates.lastName);
    }
    if (updates.hasOwnProperty('favoriteTeamId')) {
      updateFields.push('favorite_team_id = ?');
      values.push(updates.favoriteTeamId || null);
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add updated_at timestamp and user ID
    updateFields.push('updated_at = datetime("now")');
    values.push(userId);

    await db.run(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    );

    // Return updated user data
    return await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  }

  /**
   * Get user count
   * @returns {Promise<number>} Total number of users
   */
  async getUserCount() {
    const result = await db.get('SELECT COUNT(*) as count FROM users');
    return result ? result.count : 0;
  }

  /**
   * Get user basic info by ID (for admin operations)
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User basic info (name, email)
   */
  async getUserBasicInfo(userId) {
    return await db.get('SELECT first_name, last_name, email FROM users WHERE id = ?', [userId]);
  }
}