/**
 * Interface for System Settings Service
 * Handles system configuration settings with encryption support
 */
class ISystemSettingsService {
  /**
   * Get all settings for a category
   * @param {string} category - Settings category (e.g., 'smtp', 'app')
   * @returns {Promise<Array>} Array of settings objects
   */
  async getSettingsByCategory(category) {
    throw new Error('getSettingsByCategory method must be implemented');
  }

  /**
   * Get a specific setting by category and key
   * @param {string} category - Settings category
   * @param {string} key - Setting key
   * @returns {Promise<Object|null>} Setting object or null if not found
   */
  async getSetting(category, key) {
    throw new Error('getSetting method must be implemented');
  }

  /**
   * Update or create a setting
   * @param {string} category - Settings category
   * @param {string} key - Setting key
   * @param {string} value - Setting value
   * @param {boolean} encrypted - Whether the value should be encrypted
   * @param {string} description - Setting description
   * @returns {Promise<void>}
   */
  async updateSetting(category, key, value, encrypted = false, description = '') {
    throw new Error('updateSetting method must be implemented');
  }

  /**
   * Delete a setting
   * @param {string} category - Settings category
   * @param {string} key - Setting key
   * @returns {Promise<void>}
   */
  async deleteSetting(category, key) {
    throw new Error('deleteSetting method must be implemented');
  }

  /**
   * Get all settings for multiple categories
   * @param {Array<string>} categories - Array of category names
   * @returns {Promise<Object>} Object with categories as keys and settings arrays as values
   */
  async getSettingsForCategories(categories) {
    throw new Error('getSettingsForCategories method must be implemented');
  }
}

export default ISystemSettingsService;