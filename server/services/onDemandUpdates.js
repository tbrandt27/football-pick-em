import espnService from './espnApi.js';
import pickCalculator from './pickCalculator.js';
import DatabaseServiceFactory from './database/DatabaseServiceFactory.js';

class OnDemandUpdateService {
  constructor() {
    // Consider scores stale after 10 minutes
    this.staleThresholdMinutes = 10;
  }

  /**
   * Check if scores for a specific week are stale.
   * A week is considered stale if any completed game within that week
   * has a scores_updated_at timestamp older than the staleThresholdMinutes.
   */
  async areScoresStale(seasonId, week) {
    try {
      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      const games = await nflDataService.getGamesBySeasonAndWeek(seasonId, week);

      if (games.length === 0) {
        return true; // No games found for the week, consider stale to trigger initial fetch
      }

      const now = new Date();
      const staleThresholdMs = this.staleThresholdMinutes * 60 * 1000;

      // Check if any completed game's scores_updated_at is older than the threshold
      const anyStaleCompletedGame = games.some(game => {
        // Only consider games that are completed or final
        const isCompleted = ['STATUS_FINAL', 'STATUS_CLOSED', 'Final'].includes(game.status);
        
        if (isCompleted) {
          // If scores_updated_at is missing or too old, it's stale
          if (!game.scores_updated_at) {
            return true;
          }
          const lastUpdateDate = new Date(game.scores_updated_at);
          return (now.getTime() - lastUpdateDate.getTime()) > staleThresholdMs;
        }
        return false; // Not a completed game, or not stale
      });

      // If there are no completed games, but there are scheduled games,
      // we might want to consider it stale if no games have been updated at all
      const hasScheduledGames = games.some(game => ['scheduled', 'STATUS_SCHEDULED'].includes(game.status));
      const hasAnyUpdatedGame = games.some(game => game.scores_updated_at);

      if (hasScheduledGames && !hasAnyUpdatedGame) {
        return true; // Week has scheduled games but no scores have ever been updated
      }

      return anyStaleCompletedGame;

    } catch (error) {
      console.error('Error checking if scores are stale:', error);
      return true; // Err on the side of updating if an error occurs
    }
  }

  /**
   * Get the last update timestamp for a specific week
   */
  async getLastUpdateTime(seasonId, week) {
    try {
      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      const games = await nflDataService.getGamesBySeasonAndWeek(seasonId, week);
      
      console.log(`[OnDemand] Getting last update time for season ${seasonId}, week ${week}`);
      console.log(`[OnDemand] Found ${games.length} games`);
      
      // Debug: log the first few games to see their scores_updated_at values
      if (games.length > 0) {
        console.log('[OnDemand] Sample game scores_updated_at values:');
        games.slice(0, 3).forEach((game, index) => {
          console.log(`[OnDemand] Game ${index + 1}: scores_updated_at = ${game.scores_updated_at}`);
        });
      }
      
      const latestUpdate = games.reduce((latest, game) => {
        if (game.scores_updated_at && (!latest || new Date(game.scores_updated_at) > new Date(latest))) {
          return game.scores_updated_at;
        }
        return latest;
      }, null);

      console.log(`[OnDemand] Latest update time found: ${latestUpdate}`);
      return latestUpdate;
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
      
      // Determine which weeks to update for maximum efficiency
      const currentNFLWeek = seasonStatus.week;
      const weeksToUpdate = [];
      
      if (week <= currentNFLWeek) {
        // For past/current weeks, also update neighboring weeks that might have ongoing games
        if (week === currentNFLWeek) {
          // Current week: update current and previous week (in case of corrections)
          weeksToUpdate.push(Math.max(1, week - 1), week);
        } else if (week === currentNFLWeek - 1) {
          // Previous week: update just that week and current week
          weeksToUpdate.push(week, currentNFLWeek);
        } else {
          // Older weeks: just update the requested week
          weeksToUpdate.push(week);
        }
      } else {
        // Future weeks shouldn't normally be updated, but if requested, just do that week
        weeksToUpdate.push(week);
      }
      
      // Remove duplicates and update each week
      const uniqueWeeks = [...new Set(weeksToUpdate)];
      console.log(`[OnDemand] Updating weeks: ${uniqueWeeks.join(', ')}`);
      
      let totalUpdated = 0;
      let totalCreated = 0;
      let totalPicksUpdated = 0;
      
      for (const weekToUpdate of uniqueWeeks) {
        try {
          const result = await espnService.updateNFLGames(seasonId, weekToUpdate, seasonStatus.type, true);
          totalUpdated += result.updated;
          totalCreated += result.created;
          
          // After updating game scores, calculate pick results for completed games
          console.log(`[OnDemand] Calculating picks for week ${weekToUpdate} after score update`);
          try {
            const pickResult = await pickCalculator.calculatePicks(seasonId, weekToUpdate);
            totalPicksUpdated += pickResult.updatedPicks;
            console.log(`[OnDemand] Updated ${pickResult.updatedPicks} picks for ${pickResult.completedGames} completed games in week ${weekToUpdate}`);
          } catch (pickError) {
            console.error(`[OnDemand] Failed to calculate picks for week ${weekToUpdate}:`, pickError);
          }
        } catch (error) {
          console.error(`[OnDemand] Failed to update week ${weekToUpdate}:`, error);
        }
      }
      
      const result = { updated: totalUpdated, created: totalCreated, picksUpdated: totalPicksUpdated };
      
      const lastUpdate = await this.getLastUpdateTime(seasonId, week);
      
      return {
        updated: true,
        reason: 'Scores were stale',
        lastUpdate,
        gamesUpdated: result.updated,
        gamesCreated: result.created,
        picksUpdated: result.picksUpdated
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
      const seasonService = DatabaseServiceFactory.getSeasonService();
      const currentSeason = await seasonService.getCurrentSeason();
      
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

    const lastUpdateDate = new Date(lastUpdateString);
    const now = new Date();
    const minutesAgo = Math.floor((now - lastUpdateDate) / (1000 * 60));

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
        return lastUpdateDate.toLocaleDateString() + ' ' + lastUpdateDate.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    }
  }
}

export default new OnDemandUpdateService();