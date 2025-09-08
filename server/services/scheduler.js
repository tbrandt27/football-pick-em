import cron from 'node-cron';
import espnService from './espnApi.js';
import pickCalculator from './pickCalculator.js';
import onDemandUpdates from './onDemandUpdates.js';
import DatabaseServiceFactory from './database/DatabaseServiceFactory.js';
import logger from '../utils/logger.js';

class SchedulerService {
  constructor() {
    this.isRunning = false;
    this.currentTasks = new Map();
    this.gameCache = new Map();
    this.cacheExpiry = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Check if today is an NFL game day
   * NFL games typically occur on:
   * - Sunday (most games)
   * - Monday (Monday Night Football)
   * - Thursday (Thursday Night Football)
   * - Saturday (late season/playoffs)
   */
  isGameDay() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const month = today.getMonth() + 1; // 1-12
    
    // NFL season runs roughly September through February
    const isNFLSeason = (month >= 9 && month <= 12) || (month >= 1 && month <= 2);
    
    if (!isNFLSeason) {
      return false;
    }
    
    // Game days: Sunday (0), Monday (1), Thursday (4), Saturday (6)
    const gameDays = [0, 1, 4, 6];
    return gameDays.includes(dayOfWeek);
  }

  /**
   * Check if there are actual games scheduled for today
   */
  async hasGamesToday() {
    try {
      const cacheKey = 'games_today';
      const cached = this.gameCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
        logger.debug('[Scheduler] Using cached games check');
        return cached.hasGames;
      }

      const currentSeason = await this.getCurrentSeason();
      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      
      if (!currentSeason) {
        logger.debug('[Scheduler] No current season set');
        return false;
      }

      // Use the optimized method to check for games today
      const today = new Date();
      const hasGames = await nflDataService.hasGamesOnDate(currentSeason.id, today);
      
      // Cache the result
      this.gameCache.set(cacheKey, {
        hasGames,
        timestamp: Date.now()
      });
      
      logger.debug(`[Scheduler] Games today check: ${hasGames ? 'Yes' : 'No'}`);
      return hasGames;
      
    } catch (error) {
      logger.error('[Scheduler] Error checking for games today:', error);
      // Default to true to avoid missing game updates if there's an error
      return true;
    }
  }

  /**
   * Check if we're in active game hours
   * NFL games typically run from 1 PM ET to 11 PM ET on game days
   */
  isActiveGameTime() {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = easternTime.getHours();
    
    // Active between 1 PM and 11 PM ET
    return hour >= 13 && hour <= 23;
  }

  /**
   * Get current season from database
   */
  async getCurrentSeason() {
    try {
      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getCurrentSeason();
      return season;
    } catch (error) {
      logger.error('[Scheduler] Failed to get current season:', error);
      logger.error('[Scheduler] Season error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return null;
    }
  }

  /**
   * Update NFL game scores from ESPN
   */
  async updateScores() {
    try {
      logger.debug('[Scheduler] Starting automatic score update...');

      const currentSeason = await this.getCurrentSeason();
      if (!currentSeason) {
        logger.debug('[Scheduler] No current season set, skipping score update');
        return { success: false, reason: 'No current season' };
      }

      const result = await espnService.updateGameScores();
      logger.info('[Scheduler] Score update completed:', result);
      return { success: true, result };
    } catch (error) {
      logger.error('[Scheduler] Failed to update scores:', error);
      logger.error('[Scheduler] Score update error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate picks for all games in current season
   */
  async calculatePicks() {
    try {
      logger.debug('[Scheduler] Starting automatic pick calculations...');

      const currentSeason = await this.getCurrentSeason();
      if (!currentSeason) {
        logger.debug('[Scheduler] No current season set, skipping pick calculations');
        return { success: false, reason: 'No current season' };
      }

      // Get season status to determine current week
      const seasonStatus = await espnService.getCurrentSeasonStatus();
      const currentWeek = seasonStatus.week;

      // Calculate picks for current week and previous week
      const weeks = [Math.max(1, currentWeek - 1), currentWeek];
      
      const result = await pickCalculator.calculatePicksForWeeks(currentSeason.id, weeks);
      
      console.log(`[Scheduler] Pick calculations completed: ${result.totalUpdatedPicks} picks updated across ${weeks.length} weeks`);
      
      // Log individual week results
      result.weekResults.forEach(weekResult => {
        if (weekResult.error) {
          console.error(`[Scheduler] Week ${weekResult.week}: ${weekResult.error}`);
        } else {
          console.log(`[Scheduler] Week ${weekResult.week}: ${weekResult.updatedPicks} picks updated for ${weekResult.completedGames} completed games`);
        }
      });

      return { success: true, result, picksUpdated: result.totalUpdatedPicks > 0 };
    } catch (error) {
      logger.error('[Scheduler] Failed to calculate picks:', error);
      logger.error('[Scheduler] Pick calculation error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Run score updates only
   */
  async runScoreUpdate() {
    console.log('[Scheduler] Starting runScoreUpdate method');
    
    try {
      if (!this.isGameDay()) {
        logger.debug('[Scheduler] Not a game day, skipping score updates');
        return;
      }

      const hasGames = await this.hasGamesToday();
      if (!hasGames) {
        logger.debug('[Scheduler] No games scheduled today, skipping score updates');
        return;
      }

      if (!this.isActiveGameTime()) {
        console.log('[Scheduler] Outside active game hours, checking if scores are stale...');
        
        // Use on-demand service to check if scores are stale
        const currentSeason = await this.getCurrentSeason();
        if (!currentSeason) {
          console.log('[Scheduler] No current season, skipping update');
          return;
        }
        
        const seasonStatus = await espnService.getCurrentSeasonStatus();
        const currentWeek = seasonStatus.week;
        
        const staleCheck = await onDemandUpdates.updateScoresIfStale(currentSeason.id, currentWeek);
        if (!staleCheck.updated) {
          logger.debug('[Scheduler] Scores are recent, skipping update');
          return;
        }
      }

      logger.debug('[Scheduler] Running score update...');

      const result = await this.updateScores();
      logger.info('[Scheduler] Score update completed successfully:', result);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('[Scheduler] Forced garbage collection after score update');
      }
      
      console.log('[Scheduler] Memory usage after score update:', process.memoryUsage());
      console.log('[Scheduler] runScoreUpdate method completed successfully');
      return true;
      
    } catch (error) {
      console.error('[Scheduler] CRITICAL ERROR in runScoreUpdate:', error);
      console.error('[Scheduler] Error stack:', error.stack);
      console.error('[Scheduler] Memory usage at error:', process.memoryUsage());
      
      // Don't re-throw - let scheduler continue running
      return false;
    }
  }

  /**
   * Run pick calculations only
   */
  async runPickCalculations() {
    if (!this.isGameDay()) {
      logger.debug('[Scheduler] Not a game day, skipping pick calculations');
      return;
    }

    const hasGames = await this.hasGamesToday();
    if (!hasGames) {
      logger.debug('[Scheduler] No games scheduled today, skipping pick calculations');
      return;
    }

    logger.debug('[Scheduler] Running pick calculations...');

    try {
      const result = await this.calculatePicks();
      logger.info('[Scheduler] Pick calculations completed successfully:', result);
    } catch (error) {
      logger.error('[Scheduler] Pick calculations failed:', error);
      logger.error('[Scheduler] Pick calculations error stack:', error.stack);
      
      // Don't re-throw - let scheduler continue running
      return false;
    }
    
    return true;
  }

  /**
   * Run the complete update cycle: scores + picks (for manual triggers)
   */
  async runUpdateCycle() {
    logger.debug('[Scheduler] Running full update cycle...');
    
    try {
      // Update scores first
      const scoresResult = await this.updateScores();
      
      // If scores were updated successfully, calculate picks
      if (scoresResult.success) {
        logger.debug('[Scheduler] Scores updated successfully, proceeding with pick calculations...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

        const picksResult = await this.calculatePicks();

        logger.info('[Scheduler] Full update cycle completed:', {
          scoresUpdated: scoresResult.success,
          picksCalculated: picksResult.success
        });
        
        return {
          success: true,
          scoresResult,
          picksResult
        };
      } else {
        logger.debug('[Scheduler] Score update failed, skipping pick calculations');
        return {
          success: false,
          reason: 'Score update failed',
          scoresResult
        };
      }
      
    } catch (error) {
      logger.error('[Scheduler] Update cycle failed:', error);
      logger.error('[Scheduler] Update cycle error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start the automatic scheduler
   */
  start() {
    if (this.isRunning) {
      logger.debug('[Scheduler] Already running');
      return;
    }

    logger.info('[Scheduler] Starting automatic score and pick updates...');
    
    // Update scores every 15 minutes during game hours
    const scoreUpdateTask = cron.schedule('*/15 * * * *', async () => {
      try {
        await this.runScoreUpdate();
      } catch (error) {
        logger.error('[Scheduler] Score update task failed:', error);
        // Don't re-throw - keep scheduler running
      }
    }, {
      scheduled: false, // Don't start immediately
      timezone: "America/New_York" // Use Eastern Time
    });

    // Calculate picks every hour during game days (less frequent)
    const pickCalculationTask = cron.schedule('0 * * * *', async () => {
      try {
        await this.runPickCalculations();
      } catch (error) {
        logger.error('[Scheduler] Pick calculation task failed:', error);
        // Don't re-throw - keep scheduler running
      }
    }, {
      scheduled: false,
      timezone: "America/New_York"
    });

    // Extended check every 6 hours during off-hours on game days with actual games
    const offHoursCheckTask = cron.schedule('0 */6 * * *', async () => {
      try {
        // Only check if it's a potential game day AND outside active hours
        if (this.isGameDay() && !this.isActiveGameTime()) {
          const hasGames = await this.hasGamesToday();
          if (hasGames) {
            console.log('[Scheduler] Off-hours check (every 6 hours) - checking for stale scores...');
            
            // Use staleness check to avoid unnecessary updates
            const currentSeason = await this.getCurrentSeason();
            if (currentSeason) {
              const seasonStatus = await espnService.getCurrentSeasonStatus();
              const staleCheck = await onDemandUpdates.updateScoresIfStale(currentSeason.id, seasonStatus.week);
              
              if (staleCheck.updated) {
                console.log('[Scheduler] Off-hours update completed:', staleCheck);
              } else {
                console.log('[Scheduler] Off-hours check - scores are recent, no update needed');
              }
            }
          } else {
            console.log('[Scheduler] Off-hours check - no games today, skipping');
          }
        } else if (!this.isGameDay()) {
          console.log('[Scheduler] Off-hours check - not a game day, skipping');
        }
      } catch (error) {
        console.error('[Scheduler] Off-hours check failed:', error);
        // Don't re-throw - keep scheduler running
      }
    }, {
      scheduled: false,
      timezone: "America/New_York"
    });

    // Start the tasks with additional error handling
    try {
      scoreUpdateTask.start();
      this.currentTasks.set('scoreUpdate', scoreUpdateTask);
    } catch (error) {
      logger.error('[Scheduler] Failed to start score update task:', error);
    }
    
    try {
      pickCalculationTask.start();
      this.currentTasks.set('pickCalculation', pickCalculationTask);
    } catch (error) {
      logger.error('[Scheduler] Failed to start pick calculation task:', error);
    }
    
    try {
      offHoursCheckTask.start();
      this.currentTasks.set('offHoursCheck', offHoursCheckTask);
    } catch (error) {
      logger.error('[Scheduler] Failed to start off-hours check task:', error);
    }
    
    this.isRunning = true;
    logger.important('[Scheduler] Automatic updates started');
    logger.info('[Scheduler] - Score updates every 15 minutes during active game hours (1 PM - 11 PM ET) on game days with scheduled games');
    logger.info('[Scheduler] - Pick calculations every hour during game days with scheduled games');
    logger.info('[Scheduler] - Off-hours staleness checks every 6 hours on game days with scheduled games');
    logger.info('[Scheduler] - Zero activity on non-game days (Tue, Wed, Fri) and days without scheduled games');
  }

  /**
   * Stop the automatic scheduler
   */
  stop() {
    if (!this.isRunning) {
      logger.debug('[Scheduler] Not running');
      return;
    }

    console.log('[Scheduler] Stopping automatic updates...');
    
    // Stop all tasks
    this.currentTasks.forEach((task, name) => {
      task.stop();
      console.log(`[Scheduler] Stopped ${name} task`);
    });
    
    this.currentTasks.clear();
    this.isRunning = false;
    console.log('[Scheduler] Automatic updates stopped');
  }

  /**
   * Get scheduler status
   */
  async getStatus() {
    const nextUpdate = this.isRunning ?
      'Scores: every 15 min (game hours), Picks: hourly' :
      'Not scheduled';
    
    const hasGames = this.isRunning ? await this.hasGamesToday() : false;
    
    return {
      isRunning: this.isRunning,
      isGameDay: this.isGameDay(),
      hasGamesToday: hasGames,
      isActiveGameTime: this.isActiveGameTime(),
      activeTasks: Array.from(this.currentTasks.keys()),
      nextUpdate,
      cacheSize: this.gameCache.size
    };
  }

  /**
   * Manual trigger for testing
   */
  async triggerUpdate() {
    logger.info('[Scheduler] Manual update triggered');
    try {
      const result = await this.runUpdateCycle();
      logger.info('[Scheduler] Manual update completed:', result);
      return result;
    } catch (error) {
      logger.error('[Scheduler] Manual update failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new SchedulerService();