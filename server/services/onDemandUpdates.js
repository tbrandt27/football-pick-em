import db from '../models/database.js';
import espnService from './espnApi.js';

class OnDemandUpdateService {
  constructor() {
    // Consider scores stale after 10 minutes
    this.staleThresholdMinutes = 10;
  }

  /**
   * Check if scores for a specific week are stale
   */
  async areScoresStale(seasonId, week) {
    try {
      const result = await db.get(`
        SELECT 
          COUNT(*) as total_games,
          COUNT(scores_updated_at) as updated_games,
          MAX(scores_updated_at) as last_update
        FROM football_games
        WHERE season_id = ? AND week = ?
      `, [seasonId, week]);

      if (!result || result.total_games === 0) {
        return true; // No games found, consider stale
      }

      if (result.updated_games === 0) {
        return true; // No games have been updated yet
      }

      if (!result.last_update) {
        return true; // No update timestamp
      }

      // Check if last update was more than threshold minutes ago
      const lastUpdate = new Date(result.last_update);
      const now = new Date();
      const minutesSinceUpdate = (now - lastUpdate) / (1000 * 60);

      return minutesSinceUpdate > this.staleThresholdMinutes;
    } catch (error) {
      console.error('Error checking if scores are stale:', error);
      return true; // Err on the side of updating
    }
  }

  /**
   * Get the last update timestamp for a specific week
   */
  async getLastUpdateTime(seasonId, week) {
    try {
      const result = await db.get(`
        SELECT MAX(scores_updated_at) as last_update
        FROM football_games
        WHERE season_id = ? AND week = ? AND scores_updated_at IS NOT NULL
      `, [seasonId, week]);

      return result?.last_update || null;
    } catch (error) {
      console.error('Error getting last update time:', error);
      return null;
    }
  }

  /**
   * Update scores for a specific week if they are stale
   */
  async updateScoresIfStale(seasonId, week) {
    try {
      const isStale = await this.areScoresStale(seasonId, week);
      
      if (!isStale) {
        const lastUpdate = await this.getLastUpdateTime(seasonId, week);
        return {
          updated: false,
          reason: 'Scores are recent',
          lastUpdate
        };
      }

      console.log(`[OnDemand] Updating stale scores for season ${seasonId}, week ${week}`);
      
      // Get current season type from ESPN
      const seasonStatus = await espnService.getCurrentSeasonStatus();
      const result = await espnService.updateNFLGames(seasonId, week, seasonStatus.type);
      
      const lastUpdate = await this.getLastUpdateTime(seasonId, week);
      
      return {
        updated: true,
        reason: 'Scores were stale',
        lastUpdate,
        ...result
      };
    } catch (error) {
      console.error('Error in on-demand score update:', error);
      return {
        updated: false,
        reason: 'Update failed',
        error: error.message
      };
    }
  }

  /**
   * Update scores for current week if stale (convenience method)
   */
  async updateCurrentWeekIfStale() {
    try {
      const currentSeason = await db.get('SELECT * FROM seasons WHERE is_current = 1');
      if (!currentSeason) {
        throw new Error('No current season set');
      }

      const seasonStatus = await espnService.getCurrentSeasonStatus();
      const currentWeek = seasonStatus.week;

      return await this.updateScoresIfStale(currentSeason.id, currentWeek);
    } catch (error) {
      console.error('Error updating current week scores:', error);
      return {
        updated: false,
        reason: 'Failed to get current week',
        error: error.message
      };
    }
  }

  /**
   * Format last update time for display
   */
  formatLastUpdate(lastUpdateString) {
    if (!lastUpdateString) {
      return 'Never updated';
    }

    const lastUpdate = new Date(lastUpdateString);
    const now = new Date();
    const minutesAgo = Math.floor((now - lastUpdate) / (1000 * 60));

    if (minutesAgo < 1) {
      return 'Just now';
    } else if (minutesAgo === 1) {
      return '1 minute ago';
    } else if (minutesAgo < 60) {
      return `${minutesAgo} minutes ago`;
    } else {
      const hoursAgo = Math.floor(minutesAgo / 60);
      if (hoursAgo === 1) {
        return '1 hour ago';
      } else if (hoursAgo < 24) {
        return `${hoursAgo} hours ago`;
      } else {
        return lastUpdate.toLocaleDateString() + ' ' + lastUpdate.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    }
  }
}

export default new OnDemandUpdateService();