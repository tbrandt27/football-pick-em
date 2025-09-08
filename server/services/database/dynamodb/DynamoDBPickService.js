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
    
    // Use GSI user_id-index for efficient lookup
    const rawPicks = await this.db._getByUserIdGSI('picks', userId);
    
    // Apply additional filters in memory (more efficient than multiple scans)
    let filteredPicks = rawPicks;
    if (gameId) filteredPicks = filteredPicks.filter(p => p.game_id === gameId);
    if (seasonId) filteredPicks = filteredPicks.filter(p => p.season_id === seasonId);
    if (week) filteredPicks = filteredPicks.filter(p => p.week === parseInt(week));
    
    // Enrich picks with game and team data
    const enrichedPicks = [];
    for (const pick of filteredPicks) {
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
      // Create new pick with all required composite keys for GSI lookups
      const pickItem = {
        id: pickId,
        user_id: userId,
        game_id: gameId,
        season_id: footballGame.season_id,
        week: footballGame.week,
        football_game_id: footballGameId,
        pick_team_id: pickTeamId,
        tiebreaker: tiebreaker || null,
        // Composite keys for GSI lookups
        season_id_week: this.db._createCompositeKey(footballGame.season_id, footballGame.week.toString()),
        user_game_football: this.db._createCompositeKey(userId, gameId, footballGameId),
        user_id_game_id: this.db._createCompositeKey(userId, gameId),
        user_id_season_id: this.db._createCompositeKey(userId, footballGame.season_id)
      };
      
      console.log(`[DynamoDBPickService] Creating pick with composite keys:`, {
        pickId,
        userId,
        gameId,
        season_id_week: pickItem.season_id_week,
        user_game_football: pickItem.user_game_football,
        user_id_game_id: pickItem.user_id_game_id,
        user_id_season_id: pickItem.user_id_season_id
      });
      
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
    
    try {
      console.log(`[DynamoDBPickService] getGamePicksSummary called:`, { gameId, seasonId, week });
      
      // Use GSI game_id-index for efficient lookup of participants
      let participants;
      try {
        participants = await this.db._getByGameIdGSI('game_participants', gameId);
        console.log(`[DynamoDBPickService] Found ${participants.length} participants for game ${gameId}`);
      } catch (participantError) {
        console.error(`[DynamoDBPickService] Error fetching participants for game ${gameId}:`, participantError);
        // Fallback to scan if GSI fails
        console.log(`[DynamoDBPickService] Falling back to scan for participants...`);
        const scanResult = await this.db._dynamoScan('game_participants', { game_id: gameId });
        participants = scanResult.Items || [];
        console.log(`[DynamoDBPickService] Fallback scan found ${participants.length} participants for game ${gameId}`);
      }
      
      const summary = [];
    
    for (const participant of participants) {
      try {
        console.log(`[DynamoDBPickService] Processing participant: ${participant.user_id}`);
        
        // Use more efficient approach: get all picks for this user-game combination first
        const userPicks = await this.db._getByUserIdGSI('picks', participant.user_id);
        console.log(`[DynamoDBPickService] Found ${userPicks.length} total picks for user ${participant.user_id}`);
        
        // Apply filters in sequence with logging
        let picks = userPicks.filter(p => p.game_id === gameId);
        console.log(`[DynamoDBPickService] After game_id filter: ${picks.length} picks`);
        
        if (seasonId) {
          picks = picks.filter(p => p.season_id === seasonId);
          console.log(`[DynamoDBPickService] After season_id filter: ${picks.length} picks`);
        }
        
        if (week !== undefined && week !== null && week !== '') {
          const weekNum = parseInt(week);
          if (!isNaN(weekNum) && weekNum > 0) {
            picks = picks.filter(p => p.week === weekNum);
            console.log(`[DynamoDBPickService] After week filter (${weekNum}): ${picks.length} picks`);
          } else {
            console.warn(`[DynamoDBPickService] Invalid week value: ${week}, skipping week filter`);
          }
        }
        
        console.log(`[DynamoDBPickService] Final filtered picks for user ${participant.user_id}:`, picks.map(p => ({
          id: p.id,
          week: p.week,
          season_id: p.season_id,
          game_id: p.game_id,
          is_correct: p.is_correct
        })));
        
        const totalPicks = picks.length;
        const correctPicks = picks.filter(p => p.is_correct === true || p.is_correct === 1).length;
        const incorrectPicks = picks.filter(p => p.is_correct === false || p.is_correct === 0).length;
        const pickPercentage = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 100 * 100) / 100 : 0;
        
        console.log(`[DynamoDBPickService] Stats for user ${participant.user_id}: total=${totalPicks}, correct=${correctPicks}, incorrect=${incorrectPicks}, percentage=${pickPercentage}`);
        
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
        console.error(`[DynamoDBPickService] Error calculating picks for user ${participant.user_id}:`, error);
      }
    }
    
    console.log(`[DynamoDBPickService] Final summary:`, summary);
    
    // Sort by correct picks (descending), then by pick percentage (descending)
    return summary.sort((a, b) => {
      if (b.correct_picks !== a.correct_picks) {
        return b.correct_picks - a.correct_picks;
      }
      return b.pick_percentage - a.pick_percentage;
    });
    
    } catch (error) {
      console.error(`[DynamoDBPickService] Error in getGamePicksSummary:`, error);
      // Return empty summary on error to prevent UI from breaking
      return [];
    }
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
    // Use GSI user_id-index and filter in memory for complex conditions
    const userPicks = await this.db._getByUserIdGSI('picks', userId);
    const matchingPicks = userPicks.filter(p =>
      p.game_id === gameId &&
      p.pick_team_id === teamId &&
      p.season_id === seasonId
    );
    
    return matchingPicks.length > 0;
  }

  /**
   * Get existing pick for a specific football game
   * @param {string} userId - User ID
   * @param {string} gameId - Game ID
   * @param {string} footballGameId - Football game ID
   * @returns {Promise<Object|null>} Existing pick or null
   */
  async getExistingPick(userId, gameId, footballGameId) {
    try {
      // Use composite GSI for precise lookup
      const compositeKey = this.db._createCompositeKey(userId, gameId, footballGameId);
      const result = await this.db._dynamoQueryGSI('picks', 'user_game_football-index', {
        user_game_football: compositeKey
      });
      
      return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
    } catch (error) {
      // Handle missing GSI error - fallback to user_id-index GSI and filter
      if (error.code === 'ValidationException' && error.message.includes('user_game_football-index')) {
        console.warn(`[DynamoDBPickService] GSI 'user_game_football-index' not found, falling back to user_id-index for user ${userId}`);
        
        // Fallback: Use user_id-index GSI and filter for gameId and footballGameId
        const userPicks = await this.db._getByUserIdGSI('picks', userId);
        
        if (!userPicks || userPicks.length === 0) {
          return null;
        }
        
        // Find the pick for this specific game and football game
        const existingPick = userPicks.find(p =>
          p.game_id === gameId && p.football_game_id === footballGameId
        );
        return existingPick || null;
      }
      
      // Re-throw other errors
      throw error;
    }
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
    try {
      console.log(`[DynamoDBPickService] Updating picks for football game ${footballGameId}, winning team: ${winningTeamId}`);
      
      // Use GSI football_game_id-index for efficient lookup
      const picks = await this.db._dynamoQueryGSI('picks', 'football_game_id-index', {
        football_game_id: footballGameId
      });
      
      console.log(`[DynamoDBPickService] Found ${picks.Items?.length || 0} picks to update for game ${footballGameId}`);
      
      let updatedCount = 0;
      
      for (const pick of (picks.Items || [])) {
        try {
          const isCorrect = winningTeamId ? (pick.pick_team_id === winningTeamId ? 1 : 0) : 0;
          console.log(`[DynamoDBPickService] Updating pick ${pick.id}: team_id=${pick.pick_team_id}, winning_team=${winningTeamId}, is_correct=${isCorrect}`);
          
          await this.db._dynamoUpdate('picks', { id: pick.id }, {
            is_correct: isCorrect
          });
          updatedCount++;
        } catch (error) {
          console.error(`[DynamoDBPickService] Failed to update pick ${pick.id}:`, error);
        }
      }
      
      console.log(`[DynamoDBPickService] Successfully updated ${updatedCount} picks for game ${footballGameId}`);
      return { updatedCount };
      
    } catch (error) {
      console.error(`[DynamoDBPickService] Error in updatePicksForGame:`, error);
      return { updatedCount: 0 };
    }
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
    
    // Use GSI season_id-index for efficient lookup
    const picks = await this.db._getBySeasonIdGSI('picks', seasonId);
    
    // Apply week filter in memory if specified
    const filteredPicks = week ? picks.filter(p => p.week === parseInt(week)) : picks;
    
    const totalPicks = filteredPicks.length;
    const correctPicks = filteredPicks.filter(p => p.is_correct === 1 || p.is_correct === true).length;
    const incorrectPicks = filteredPicks.filter(p => p.is_correct === 0 || p.is_correct === false).length;
    const pendingPicks = filteredPicks.filter(p => p.is_correct === null || p.is_correct === undefined).length;
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