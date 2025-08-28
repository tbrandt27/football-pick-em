import ISystemSettingsService from '../interfaces/ISystemSettingsService.js';
import db from '../../../models/database.js';

export default class SQLiteSystemSettingsService extends ISystemSettingsService {

  /**
   * Get all settings for a category
   * @param {string} category - Settings category (e.g., 'smtp', 'app')
   * @returns {Promise<Array>} Array of settings objects
   */
  async getSettingsByCategory(category) {
    try {
      console.log(`[SQLiteSystemSettingsService] Getting settings for category: ${category}`);
      
      const settings = await db.all(`
        SELECT key, value, encrypted, description
        FROM system_settings 
        WHERE category = ?
        ORDER BY key
      `, [category]);
      
      console.log(`[SQLiteSystemSettingsService] Found ${settings.length} settings for category ${category}`);
      return settings || [];
    } catch (error) {
      console.error(`[SQLiteSystemSettingsService] Error getting settings for category ${category}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific setting by category and key
   * @param {string} category - Settings category
   * @param {string} key - Setting key
   * @returns {Promise<Object|null>} Setting object or null if not found
   */
  async getSetting(category, key) {
    try {
      const setting = await db.get(`
        SELECT id, category, key, value, encrypted, description, created_at, updated_at
        FROM system_settings 
        WHERE category = ? AND key = ?
      `, [category, key]);
      
      return setting || null;
    } catch (error) {
      console.error(`[SQLiteSystemSettingsService] Error getting setting ${category}/${key}:`, error);
      throw error;
    }
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
    try {
      const settingId = `${category}_${key}`;
      
      await db.run(`
        INSERT OR REPLACE INTO system_settings (id, category, key, value, encrypted, description, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        settingId,
        category,
        key,
        value,
        encrypted ? 1 : 0,
        description
      ]);
      
      console.log(`[SQLiteSystemSettingsService] Updated setting ${category}/${key}`);
    } catch (error) {
      console.error(`[SQLiteSystemSettingsService] Error updating setting ${category}/${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete a setting
   * @param {string} category - Settings category
   * @param {string} key - Setting key
   * @returns {Promise<void>}
   */
  async deleteSetting(category, key) {
    try {
      await db.run(`
        DELETE FROM system_settings 
        WHERE category = ? AND key = ?
      `, [category, key]);
      
      console.log(`[SQLiteSystemSettingsService] Deleted setting ${category}/${key}`);
    } catch (error) {
      console.error(`[SQLiteSystemSettingsService] Error deleting setting ${category}/${key}:`, error);
      throw error;
    }
  }

  /**
   * Get all settings for multiple categories
   * @param {Array<string>} categories - Array of category names
   * @returns {Promise<Object>} Object with categories as keys and settings arrays as values
   */
  async getSettingsForCategories(categories) {
    try {
      const result = {};
      
      for (const category of categories) {
        result[category] = await this.getSettingsByCategory(category);
      }
      
      return result;
    } catch (error) {
      console.error(`[SQLiteSystemSettingsService] Error getting settings for categories:`, error);
      throw error;
    }
  }
}