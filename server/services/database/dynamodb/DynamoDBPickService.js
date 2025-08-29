import { v4 as uuidv4 } from 'uuid';
import IPickService from '../interfaces/IPickService.js';
import db from '../../../models/database.js';

/**
 * DynamoDB-specific Pick Service
 * Implements pick operations using DynamoDB database provider
 */
export default class DynamoDBPickService extends IPickService {
  constructor() {
    super();
    this.db = db.provider; // Use the singleton database provider
  }

  /**
   * Get picks for a user
   * @param {Object} filters - Filter criteria
   * @param {string} filters.userId - User ID
   * @param {string} [filters.gameId] - Game ID
   * @param {string} [filters.seasonId] - Season ID
   * @param {number} [filters.week] - Week number
   * @returns {Promise<Array>} Picks with game and team info
   */
  async getUserPicks(filters) {
    const { userId, gameId, seasonId, week } = filters;
    
    // Build scan conditions
    let pickConditions = { user_id: userId };
    if (gameId) pickConditions.game_id = gameId;
    if (seasonId) pickConditions.season_id = seasonId;
    if (week) pickConditions.week = parseInt(week);
    
    const picksResult = await this.db._dynamoScan('picks', pickConditions);
    const rawPicks = picksResult.Items || [];
    
    // Enrich picks with game and team data
    const enrichedPicks = [];
    for (const pick of rawPicks) {
      try {
        // Get football game
        const gameResult = await this.db._dynamoGet('football_games', { id: pick.football_game_id });
        const footballGame = gameResult.Item;
        
        if (footballGame) {
          // Get teams
          const [homeTeamResult, awayTeamResult, pickTeamResult] = await Promise.all([
            this.db._dynamoGet('football_teams', { id: footballGame.home_team_id }),
            this.db._dynamoGet('football_teams', { id: footballGame.away_team_id }),
            this.db._dynamoGet('football_teams', { id: pick.pick_team_id })
          ]);
          
          const homeTeam = homeTeamResult.Item || {};
          const awayTeam = awayTeamResult.Item || {};
          const pickTeam = pickTeamResult.Item || {};
          
          enrichedPicks.push({
            ...pick,
            week: footballGame.week,
            start_time: footballGame.start_time,
            game_status: footballGame.status,
            home_team_city: homeTeam.team_city,
            home_team_name: homeTeam.team_name,
            home_team_code: homeTeam.team_code,
            away_team_city: awayTeam.team_city,
            away_team_name: awayTeam.team_name,
            away_team_code: awayTeam.team_code,
            pick_team_city: pickTeam.team_city,
            pick_team_name: pickTeam.team_name,
            pick_team_code: pickTeam.team_code
          });
        }
      } catch (error) {
        console.warn('Error enriching pick data:', error);
      }
    }
    
    // Sort by week and start_time
    return enrichedPicks.sort((a, b) => {
      if (a.week !== b.week) return a.week - b.week;
      return new Date(a.start_time) - new Date(b.start_time);
    });
  }

  /**
   * Create or update a pick
   * @param {Object} pickData - Pick data
   * @param {string} pickData.userId - User ID
   * @param {string} pickData.gameId - Game ID
   * @param {string} pickData.footballGameId - Football game ID
   * @param {string} pickData.pickTeamId - Team ID of the pick
   * @param {number} [pickData.tiebreaker] - Tiebreaker value
   * @returns {Promise<Object>} Created/updated pick
   */
  async createOrUpdatePick(pickData) {
    const { userId, gameId, footballGameId, pickTeamId, tiebreaker } = pickData;

    // Get football game details for season and week
    const gameResult = await this.db._dynamoGet('football_games', { id: footballGameId });
    const footballGame = gameResult.Item;

    if (!footballGame) {
      throw new Error('Football game not found');
    }

    // Check if pick already exists
    const existingPick = await this.getExistingPick(userId, gameId, footballGameId);
    const pickId = existingPick?.id || uuidv4();

    if (existingPick) {
      // Update existing pick
      await this.db._dynamoUpdate('picks', { id: pickId }, {
        pick_team_id: pickTeamId,
        tiebreaker: tiebreaker || null
      });
    } else {
      // Create new pick
      const pickItem = {
        id: pickId,
        user_id: userId,
        game_id: gameId,
        season_id: footballGame.season_id,
        week: footballGame.week,
        football_game_id: footballGameId,
        pick_team_id: pickTeamId,
        tiebreaker: tiebreaker || null
      };
      
      await this.db._dynamoPut('picks', pickItem);
    }

    // Return the pick with team info
    return await this.getPickById(pickId);
  }

  /**
   * Delete a pick
   * @param {string} pickId - Pick ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<void>}
   */
  async deletePick(pickId, userId) {
    const pick = await this.getPickById(pickId);
    
    if (!pick) {
      throw new Error('Pick not found');
    }

    if (pick.user_id !== userId) {
      throw new Error('Access denied');
    }

    await this.db._dynamoDelete('picks', { id: pickId });
  }

  /**
   * Get pick by ID
   * @param {string} pickId - Pick ID
   * @returns {Promise<Object|null>} Pick with game info
   */
  async getPickById(pickId) {
    const pickResult = await this.db._dynamoGet('picks', { id: pickId });
    const pick = pickResult.Item;
    
    if (!pick) {
      return null;
    }

    // Get football game for start time
    const gameResult = await this.db._dynamoGet('football_games', { id: pick.football_game_id });
    const footballGame = gameResult.Item;
    
    // Get team info
    const teamResult = await this.db._dynamoGet('football_teams', { id: pick.pick_team_id });
    const team = teamResult.Item || {};
    
    return {
      ...pick,
      start_time: footballGame ? footballGame.start_time : null,
      pick_team_city: team.team_city,
      pick_team_name: team.team_name,
      pick_team_code: team.team_code
    };
  }

  /**
   * Get picks summary for a game
   * @param {string} gameId - Game ID
   * @param {Object} [filters] - Additional filters
   * @param {string} [filters.seasonId] - Season ID
   * @param {number} [filters.week] - Week number
   * @returns {Promise<Array>} User pick statistics
   */
  async getGamePicksSummary(gameId, filters = {}) {
    const { seasonId, week } = filters;
    
    // Get all participants for this game
    const participantsResult = await this.db._dynamoScan('game_participants', { game_id: gameId });
    const participants = participantsResult.Items || [];
    
    const summary = [];
    
    for (const participant of participants) {
      try {
        // Get picks for this user/game
        let pickConditions = {
          user_id: participant.user_id,
          game_id: gameId
        };
        if (seasonId) pickConditions.season_id = seasonId;
        if (week) pickConditions.week = parseInt(week);
        
        const picksResult = await this.db._dynamoScan('picks', pickConditions);
        const picks = picksResult.Items || [];
        
        const totalPicks = picks.length;
        const correctPicks = picks.filter(p => p.is_correct === true || p.is_correct === 1).length;
        const pickPercentage = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 100 * 100) / 100 : 0;
        
        // Get user info
        const userResult = await this.db._dynamoGet('users', { id: participant.user_id });
        const user = userResult.Item || {};
        
        summary.push({
          user_id: participant.user_id,
          first_name: user.first_name || 'Unknown',
          last_name: user.last_name || 'User',
          total_picks: totalPicks,
          correct_picks: correctPicks,
          pick_percentage: pickPercentage
        });
      } catch (error) {
        console.warn('Error calculating picks for user:', participant.user_id, error);
      }
    }
    
    // Sort by percentage, then by correct picks
    return summary.sort((a, b) => {
      if (b.pick_percentage !== a.pick_percentage) {
        return b.pick_percentage - a.pick_percentage;
      }
      return b.correct_picks - a.correct_picks;
    });
  }

  /**
   * Check if user has already picked a team in survivor mode
   * @param {string} userId - User ID
   * @param {string} gameId - Game ID
   * @param {string} teamId - Team ID
   * @param {string} seasonId - Season ID
   * @returns {Promise<boolean>} True if team was already picked
   */
  async hasPickedTeamInSurvivor(userId, gameId, teamId, seasonId) {
    const picksResult = await this.db._dynamoScan('picks', {
      user_id: userId,
      game_id: gameId,
      pick_team_id: teamId,
      season_id: seasonId
    });
    
    return picksResult.Items && picksResult.Items.length > 0;
  }

  /**
   * Get existing pick for a specific football game
   * @param {string} userId - User ID
   * @param {string} gameId - Game ID
   * @param {string} footballGameId - Football game ID
   * @returns {Promise<Object|null>} Existing pick or null
   */
  async getExistingPick(userId, gameId, footballGameId) {
    const picksResult = await this.db._dynamoScan('picks', {
      user_id: userId,
      game_id: gameId,
      football_game_id: footballGameId
    });
    
    return picksResult.Items && picksResult.Items.length > 0 ? picksResult.Items[0] : null;
  }

  /**
   * Update pick correctness after game completion
   * @param {string} pickId - Pick ID
   * @param {boolean} isCorrect - Whether the pick was correct
   * @returns {Promise<void>}
   */
  async updatePickCorrectness(pickId, isCorrect) {
    await this.db._dynamoUpdate('picks', { id: pickId }, {
      is_correct: isCorrect
    });
  }

  /**
   * Bulk update pick correctness for multiple picks
   * @param {Array} updates - Array of {pickId, isCorrect} objects
   * @returns {Promise<void>}
   */
  async bulkUpdatePickCorrectness(updates) {
    // DynamoDB doesn't support bulk updates in a single operation
    // Process updates sequentially
    for (const update of updates) {
      try {
        await this.updatePickCorrectness(update.pickId, update.isCorrect);
      } catch (error) {
        console.error(`Failed to update pick ${update.pickId}:`, error);
      }
    }
  }

  /**
   * Update all picks for a completed game
   * @param {string} footballGameId - Football game ID
   * @param {string|null} winningTeamId - Winning team ID (null for ties)
   * @returns {Promise<{updatedCount: number}>} Number of picks updated
   */
  async updatePicksForGame(footballGameId, winningTeamId) {
    // Get all picks for this football game
    const picksResult = await this.db._dynamoScan('picks', { football_game_id: footballGameId });
    const picks = picksResult.Items || [];
    
    let updatedCount = 0;
    
    for (const pick of picks) {
      try {
        const isCorrect = winningTeamId ? (pick.pick_team_id === winningTeamId ? 1 : 0) : 0;
        await this.db._dynamoUpdate('picks', { id: pick.id }, {
          is_correct: isCorrect
        });
        updatedCount++;
      } catch (error) {
        console.error(`Failed to update pick ${pick.id}:`, error);
      }
    }
    
    return { updatedCount };
  }

  /**
   * Get pick statistics for a season
   * @param {string} seasonId - Season ID
   * @param {number|null} [week] - Specific week (optional)
   * @returns {Promise<Object>} Pick statistics
   */
  async getPicksStatsBySeason(seasonId, week = null) {
    // Build scan conditions
    let pickConditions = { season_id: seasonId };
    if (week) pickConditions.week = parseInt(week);
    
    const picksResult = await this.db._dynamoScan('picks', pickConditions);
    const picks = picksResult.Items || [];
    
    const totalPicks = picks.length;
    const correctPicks = picks.filter(p => p.is_correct === 1 || p.is_correct === true).length;
    const incorrectPicks = picks.filter(p => p.is_correct === 0 || p.is_correct === false).length;
    const pendingPicks = picks.filter(p => p.is_correct === null || p.is_correct === undefined).length;
    const completedPicks = correctPicks + incorrectPicks;
    const accuracyPercentage = completedPicks > 0 ? Math.round((correctPicks / completedPicks) * 100 * 100) / 100 : 0;
    
    return {
      total_picks: totalPicks,
      correct_picks: correctPicks,
      incorrect_picks: incorrectPicks,
      pending_picks: pendingPicks,
      accuracy_percentage: accuracyPercentage
    };
  }
}