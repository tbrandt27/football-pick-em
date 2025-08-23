/**
 * User Service Interface
 * Defines database-agnostic operations for user management
 */
export default class IUserService {
  /**
   * Get all users (admin only)
   * @returns {Promise<Array>} Users with team info
   */
  async getAllUsers() {
    throw new Error('getAllUsers must be implemented');
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User with team info
   */
  async getUserById(userId) {
    throw new Error('getUserById must be implemented');
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User data
   */
  async getUserByEmail(email) {
    throw new Error('getUserByEmail must be implemented');
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} userData.id - User ID
   * @param {string} userData.email - User email
   * @param {string} userData.password - Hashed password
   * @param {string} userData.firstName - First name
   * @param {string} userData.lastName - Last name
   * @param {string} [userData.favoriteTeamId] - Favorite team ID
   * @param {string} [userData.emailVerificationToken] - Email verification token
   * @param {boolean} [userData.emailVerified] - Email verified status
   * @returns {Promise<Object>} Created user
   */
  async createUser(userData) {
    throw new Error('createUser must be implemented');
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   * @param {string} [updates.firstName] - First name
   * @param {string} [updates.lastName] - Last name
   * @param {string} [updates.favoriteTeamId] - Favorite team ID
   * @returns {Promise<Object>} Updated user
   */
  async updateUser(userId, updates) {
    throw new Error('updateUser must be implemented');
  }

  /**
   * Update user admin status
   * @param {string} userId - User ID
   * @param {boolean} isAdmin - Admin status
   * @returns {Promise<void>}
   */
  async updateAdminStatus(userId, isAdmin) {
    throw new Error('updateAdminStatus must be implemented');
  }

  /**
   * Update user email verification status
   * @param {string} userId - User ID
   * @param {boolean} emailVerified - Email verification status
   * @returns {Promise<void>}
   */
  async updateEmailVerified(userId, emailVerified) {
    throw new Error('updateEmailVerified must be implemented');
  }

  /**
   * Update user's last login timestamp
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async updateLastLogin(userId) {
    throw new Error('updateLastLogin must be implemented');
  }

  /**
   * Get user's game participation
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Games with participation info
   */
  async getUserGames(userId) {
    throw new Error('getUserGames must be implemented');
  }

  /**
   * Delete user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Deleted user info
   */
  async deleteUser(userId) {
    throw new Error('deleteUser must be implemented');
  }

  /**
   * Set password reset token
   * @param {string} userId - User ID
   * @param {string} resetToken - Reset token
   * @param {Date} expiresAt - Token expiration
   * @returns {Promise<void>}
   */
  async setPasswordResetToken(userId, resetToken, expiresAt) {
    throw new Error('setPasswordResetToken must be implemented');
  }

  /**
   * Get user by password reset token
   * @param {string} resetToken - Reset token
   * @returns {Promise<Object|null>} User if token valid
   */
  async getUserByResetToken(resetToken) {
    throw new Error('getUserByResetToken must be implemented');
  }

  /**
   * Reset user password
   * @param {string} userId - User ID
   * @param {string} hashedPassword - New hashed password
   * @returns {Promise<void>}
   */
  async resetPassword(userId, hashedPassword) {
    throw new Error('resetPassword must be implemented');
  }

  /**
   * Check if user exists by email
   * @param {string} email - User email
   * @returns {Promise<boolean>} True if user exists
   */
  async userExists(email) {
    throw new Error('userExists must be implemented');
  }

  /**
   * Get first admin user
   * @returns {Promise<Object|null>} First admin user
   */
  async getFirstAdminUser() {
    throw new Error('getFirstAdminUser must be implemented');
  }

  /**
   * Get any user (fallback for operations)
   * @returns {Promise<Object|null>} Any user
   */
  async getAnyUser() {
    throw new Error('getAnyUser must be implemented');
  }

  /**
   * Get user count
   * @returns {Promise<number>} Total number of users
   */
  async getUserCount() {
    throw new Error('getUserCount must be implemented');
  }

  /**
   * Get user basic info by ID (for admin operations)
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User basic info (name, email)
   */
  async getUserBasicInfo(userId) {
    throw new Error('getUserBasicInfo must be implemented');
  }
}