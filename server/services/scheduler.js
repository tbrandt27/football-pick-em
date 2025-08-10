import cron from 'node-cron';
import espnService from './espnApi.js';
import pickCalculator from './pickCalculator.js';
import db from '../models/database.js';

class SchedulerService {
  constructor() {
    this.isRunning = false;
    this.currentTasks = new Map();
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
      const season = await db.get('SELECT * FROM seasons WHERE is_current = 1');
      return season;
    } catch (error) {
      console.error('Failed to get current season:', error);
      return null;
    }
  }

  /**
   * Update NFL game scores from ESPN
   */
  async updateScores() {
    try {
      console.log('[Scheduler] Starting automatic score update...');
      
      const currentSeason = await this.getCurrentSeason();
      if (!currentSeason) {
        console.log('[Scheduler] No current season set, skipping score update');
        return false;
      }

      const result = await espnService.updateGameScores();
      console.log('[Scheduler] Score update completed:', result);
      return true;
    } catch (error) {
      console.error('[Scheduler] Failed to update scores:', error);
      return false;
    }
  }

  /**
   * Calculate picks for all games in current season
   */
  async calculatePicks() {
    try {
      console.log('[Scheduler] Starting automatic pick calculations...');
      
      const currentSeason = await this.getCurrentSeason();
      if (!currentSeason) {
        console.log('[Scheduler] No current season set, skipping pick calculations');
        return false;
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

      return result.totalUpdatedPicks > 0;
    } catch (error) {
      console.error('[Scheduler] Failed to calculate picks:', error);
      return false;
    }
  }

  /**
   * Run score updates only
   */
  async runScoreUpdate() {
    if (!this.isGameDay()) {
      console.log('[Scheduler] Not a game day, skipping score updates');
      return;
    }

    if (!this.isActiveGameTime()) {
      console.log('[Scheduler] Outside active game hours, skipping score updates');
      return;
    }

    console.log('[Scheduler] Running score update...');
    
    try {
      await this.updateScores();
      console.log('[Scheduler] Score update completed');
    } catch (error) {
      console.error('[Scheduler] Score update failed:', error);
    }
  }

  /**
   * Run pick calculations only  
   */
  async runPickCalculations() {
    if (!this.isGameDay()) {
      console.log('[Scheduler] Not a game day, skipping pick calculations');
      return;
    }

    console.log('[Scheduler] Running pick calculations...');
    
    try {
      await this.calculatePicks();
      console.log('[Scheduler] Pick calculations completed');
    } catch (error) {
      console.error('[Scheduler] Pick calculations failed:', error);
    }
  }

  /**
   * Run the complete update cycle: scores + picks (for manual triggers)
   */
  async runUpdateCycle() {
    console.log('[Scheduler] Running full update cycle...');
    
    try {
      // Update scores first
      const scoresUpdated = await this.updateScores();
      
      // If scores were updated successfully, calculate picks
      if (scoresUpdated) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        await this.calculatePicks();
      }
      
      console.log('[Scheduler] Full update cycle completed');
    } catch (error) {
      console.error('[Scheduler] Update cycle failed:', error);
    }
  }

  /**
   * Start the automatic scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting automatic score and pick updates...');
    
    // Update scores every 15 minutes during game hours
    const scoreUpdateTask = cron.schedule('*/15 * * * *', () => {
      this.runScoreUpdate();
    }, {
      scheduled: false, // Don't start immediately
      timezone: "America/New_York" // Use Eastern Time
    });

    // Calculate picks every hour during game days (less frequent)
    const pickCalculationTask = cron.schedule('0 * * * *', () => {
      this.runPickCalculations();
    }, {
      scheduled: false,
      timezone: "America/New_York"
    });

    // Light score check every hour during off-hours on game days
    const offHoursCheckTask = cron.schedule('30 * * * *', () => {
      if (this.isGameDay() && !this.isActiveGameTime()) {
        console.log('[Scheduler] Off-hours check - updating scores only');
        this.updateScores();
      }
    }, {
      scheduled: false,
      timezone: "America/New_York"
    });

    // Start the tasks
    scoreUpdateTask.start();
    pickCalculationTask.start();
    offHoursCheckTask.start();

    // Store task references
    this.currentTasks.set('scoreUpdate', scoreUpdateTask);
    this.currentTasks.set('pickCalculation', pickCalculationTask);
    this.currentTasks.set('offHoursCheck', offHoursCheckTask);
    
    this.isRunning = true;
    console.log('[Scheduler] Automatic updates started');
    console.log('[Scheduler] - Score updates every 15 minutes during active game hours (1 PM - 11 PM ET)');
    console.log('[Scheduler] - Pick calculations every hour during game days');
    console.log('[Scheduler] - Off-hours score checks at 30 minutes past each hour');
  }

  /**
   * Stop the automatic scheduler
   */
  stop() {
    if (!this.isRunning) {
      console.log('[Scheduler] Not running');
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
  getStatus() {
    const nextUpdate = this.isRunning ? 
      'Scores: every 15 min (game hours), Picks: hourly' : 
      'Not scheduled';
    
    return {
      isRunning: this.isRunning,
      isGameDay: this.isGameDay(),
      isActiveGameTime: this.isActiveGameTime(),
      activeTasks: Array.from(this.currentTasks.keys()),
      nextUpdate
    };
  }

  /**
   * Manual trigger for testing
   */
  async triggerUpdate() {
    console.log('[Scheduler] Manual update triggered');
    await this.runUpdateCycle();
  }
}

export default new SchedulerService();