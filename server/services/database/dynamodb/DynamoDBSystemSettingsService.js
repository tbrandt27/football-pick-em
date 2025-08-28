import ISystemSettingsService from '../interfaces/ISystemSettingsService.js';
import db from '../../../models/database.js';

export default class DynamoDBSystemSettingsService extends ISystemSettingsService {
  constructor() {
    super();
    this.db = db.provider; // Use the singleton database provider
  }

  /**
   * Get all settings for a category
   * @param {string} category - Settings category (e.g., 'smtp', 'app')
   * @returns {Promise<Array>} Array of settings objects
   */
  async getSettingsByCategory(category) {
    try {
      console.log(`[DynamoDBSystemSettingsService] Getting settings for category: ${category}`);
      
      const result = await this.db._dynamoScan('system_settings', { category });
      const settings = result.Items || [];
      
      console.log(`[DynamoDBSystemSettingsService] Found ${settings.length} settings for category ${category}`);
      return settings;
    } catch (error) {
      console.error(`[DynamoDBSystemSettingsService] Error getting settings for category ${category}:`, error);
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
      const settingId = `${category}_${key}`;
      const result = await this.db._dynamoGet('system_settings', { id: settingId });
      return result ? result.Item : null;
    } catch (error) {
      console.error(`[DynamoDBSystemSettingsService] Error getting setting ${category}/${key}:`, error);
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
      const now = new Date().toISOString();
      
      const setting = {
        id: settingId,
        category,
        key,
        value,
        encrypted: encrypted ? 1 : 0, // DynamoDB uses numbers for booleans
        description,
        updated_at: now
      };

      // Check if setting exists to determine if we need created_at
      const existingSetting = await this.getSetting(category, key);
      if (!existingSetting) {
        setting.created_at = now;
      }

      await this.db._dynamoPut('system_settings', setting);
      console.log(`[DynamoDBSystemSettingsService] Updated setting ${category}/${key}`);
    } catch (error) {
      console.error(`[DynamoDBSystemSettingsService] Error updating setting ${category}/${key}:`, error);
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
      const settingId = `${category}_${key}`;
      await this.db._dynamoDelete('system_settings', { id: settingId });
      console.log(`[DynamoDBSystemSettingsService] Deleted setting ${category}/${key}`);
    } catch (error) {
      console.error(`[DynamoDBSystemSettingsService] Error deleting setting ${category}/${key}:`, error);
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
      console.error(`[DynamoDBSystemSettingsService] Error getting settings for categories:`, error);
      throw error;
    }
  }
}