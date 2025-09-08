import { v4 as uuidv4 } from 'uuid';
import INFLDataService from '../interfaces/INFLDataService.js';
import db from '../../../models/database.js';

/**
 * DynamoDB-specific NFL Data Service
 * Implements NFL team and game operations using DynamoDB database provider
 */
export default class DynamoDBNFLDataService extends INFLDataService {
  constructor() {
    super();
    this.db = db.provider; // Use the singleton database provider
  }

  /**
   * Find team by team code
   * @param {string} teamCode - Team code (e.g., 'KC', 'SF')
   * @returns {Promise<Object|null>} Team or null
   */
  async getTeamByCode(teamCode) {
    // Use GSI team_code-index for efficient lookup
    return await this.db._getByTeamCodeGSI('football_teams', teamCode);
  }

  /**
   * Create or update team
   * @param {Object} teamData - Team data
   * @param {string} teamData.teamCode - Team code
   * @param {string} teamData.teamName - Team name
   * @param {string} teamData.teamCity - Team city
   * @param {string} [teamData.conference] - Conference
   * @param {string} [teamData.division] - Division
   * @param {string} [teamData.primaryColor] - Primary color
   * @param {string} [teamData.secondaryColor] - Secondary color
   * @returns {Promise<Object>} Created/updated team
   */
  async createOrUpdateTeam(teamData) {
    const { teamCode, teamName, teamCity, conference, division, primaryColor, secondaryColor } = teamData;
    
    // Check if team exists
    const existingTeam = await this.getTeamByCode(teamCode);
    
    if (existingTeam) {
      // Update existing team
      const updates = {};
      if (teamName && !existingTeam.team_name) updates.team_name = teamName;
      if (teamCity && !existingTeam.team_city) updates.team_city = teamCity;
      if (conference && !existingTeam.team_conference) updates.team_conference = conference;
      if (division && !existingTeam.team_division) updates.team_division = division;
      if (primaryColor && !existingTeam.team_primary_color) updates.team_primary_color = primaryColor;
      if (secondaryColor && !existingTeam.team_secondary_color) updates.team_secondary_color = secondaryColor;
      
      if (Object.keys(updates).length > 0) {
        await this.db._dynamoUpdate('football_teams', { id: existingTeam.id }, updates);
        return { ...existingTeam, ...updates };
      }
      
      return existingTeam;
    } else {
      // Create new team
      const teamId = uuidv4();
      const now = new Date().toISOString();
      
      const teamItem = {
        id: teamId,
        team_code: teamCode,
        team_name: teamName,
        team_city: teamCity,
        team_conference: conference || 'Unknown',
        team_division: division || 'Unknown',
        team_logo: null,
        team_primary_color: primaryColor || null,
        team_secondary_color: secondaryColor || null,
        created_at: now,
        updated_at: now
      };
      
      await this.db._dynamoPut('football_teams', teamItem);
      return teamItem;
    }
  }

  /**
   * Find football game by criteria
   * @param {Object} criteria - Search criteria
   * @param {string} criteria.seasonId - Season ID
   * @param {number} criteria.week - Week number
   * @param {string} criteria.homeTeamId - Home team ID
   * @param {string} criteria.awayTeamId - Away team ID
   * @returns {Promise<Object|null>} Football game or null
   */
  async findFootballGame(criteria) {
    const { seasonId, week, homeTeamId, awayTeamId } = criteria;
    
    // Use GSI season_id-index and filter in memory for complex conditions
    const seasonGames = await this.db._getBySeasonIdGSI('football_games', seasonId);
    
    const matchingGame = seasonGames.find(game =>
      game.week === week &&
      game.home_team_id === homeTeamId &&
      game.away_team_id === awayTeamId
    );
    
    return matchingGame || null;
  }

  /**
   * Create football game
   * @param {Object} gameData - Game data
   * @returns {Promise<Object>} Created game
   */
  async createFootballGame(gameData) {
    const gameId = uuidv4();
    const now = new Date().toISOString();
    
    const gameItem = {
      id: gameId,
      ...gameData,
      created_at: now,
      updated_at: now
    };
    
    await this.db._dynamoPut('football_games', gameItem);
    return gameItem;
  }

  /**
   * Update football game
   * @param {string} gameId - Game ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated game
   */
  async updateFootballGame(gameId, updates) {
    const existingGameResult = await this.db._dynamoGet('football_games', { id: gameId });
    if (!existingGameResult.Item) {
      throw new Error('Football game not found');
    }

    const updateData = {
      ...updates
    };

    await this.db._dynamoUpdate('football_games', { id: gameId }, updateData);

    // Return updated game
    const updatedResult = await this.db._dynamoGet('football_games', { id: gameId });
    return updatedResult.Item;
  }

  /**
   * Get current season (from seasons table)
   * @returns {Promise<Object|null>} Current season or null
   */
  async getCurrentSeason() {
    try {
      // Try GSI is_current-index for efficient lookup
      const result = await this.db._dynamoQueryGSI('seasons', 'is_current-index', { is_current: true });
      return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
    } catch (error) {
      // Fallback to scan if GSI doesn't exist (backward compatibility)
      if (error.name === 'ResourceNotFoundException' || error.name === 'ValidationException') {
        console.log(`[DynamoDB NFL] GSI not found (${error.name}), falling back to scan for current season`);
        const result = await this.db._dynamoScan('seasons', { is_current: true });
        return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
      }
      throw error;
    }
  }

  /**
   * Get football games by season and week
   * @param {string} seasonId - Season ID
   * @param {number} week - Week number
   * @returns {Promise<Array>} Football games
   */
  async getGamesBySeasonAndWeek(seasonId, week) {
    // Use GSI season_id-index and filter in memory for week
    const seasonGames = await this.db._getBySeasonIdGSI('football_games', seasonId);
    return seasonGames.filter(game => game.week === parseInt(week));
  }

  /**
   * Get football games by season
   * @param {string} seasonId - Season ID
   * @returns {Promise<Array>} Football games
   */
  async getGamesBySeason(seasonId) {
    // Use GSI season_id-index for efficient lookup
    return await this.db._getBySeasonIdGSI('football_games', seasonId);
  }

  /**
   * Get football game by ID
   * @param {string} gameId - Football game ID
   * @returns {Promise<Object|null>} Football game or null
   */
  async getFootballGameById(gameId) {
    const gameResult = await this.db._dynamoGet('football_games', { id: gameId });
    return gameResult.Item || null;
  }

  /**
   * Get football games by date range
   * @param {string} seasonId - Season ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Football games in date range
   */
  async getGamesByDateRange(seasonId, startDate, endDate) {
    // Get all games for the season first
    const allGames = await this.getGamesBySeason(seasonId);
    
    // Filter by date range
    return allGames.filter(game => {
      const gameDate = new Date(game.game_date);
      return gameDate >= startDate && gameDate <= endDate;
    });
  }

  /**
   * Get football games for today
   * @param {string} seasonId - Season ID
   * @returns {Promise<Array>} Football games scheduled for today
   */
  async getGamesToday(seasonId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.getGamesByDateRange(seasonId, today, tomorrow);
  }

  /**
   * Check if there are any games scheduled for a specific date
   * @param {string} seasonId - Season ID
   * @param {Date} date - Date to check
   * @returns {Promise<boolean>} True if games exist for the date
   */
  async hasGamesOnDate(seasonId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    
    const games = await this.getGamesByDateRange(seasonId, startOfDay, endOfDay);
    return games.length > 0;
  }

  /**
   * Get team by ID
   * @param {string} teamId - Team ID
   * @returns {Promise<Object|null>} Team or null
   */
  async getTeamById(teamId) {
    const teamResult = await this.db._dynamoGet('football_teams', { id: teamId });
    return teamResult.Item || null;
  }

  /**
   * Update team
   * @param {string} teamId - Team ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated team
   */
  async updateTeam(teamId, updates) {
    const existingTeamResult = await this.db._dynamoGet('football_teams', { id: teamId });
    if (!existingTeamResult.Item) {
      throw new Error('Team not found');
    }

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    await this.db._dynamoUpdate('football_teams', { id: teamId }, updateData);

    // Return updated team
    const updatedResult = await this.db._dynamoGet('football_teams', { id: teamId });
    return updatedResult.Item;
  }

  /**
   * Get game count by season
   * @param {string} seasonId - Season ID
   * @returns {Promise<Object>} Game count result
   */
  async getGameCountBySeason(seasonId) {
    // Use GSI season_id-index for efficient lookup
    const games = await this.db._getBySeasonIdGSI('football_games', seasonId);
    return { count: games ? games.length : 0 };
  }

  /**
   * Update game time
   * @param {string} gameId - Game ID
   * @param {string} startTime - New start time
   * @returns {Promise<Object>} Updated game
   */
  async updateGameTime(gameId, startTime) {
    const existingGameResult = await this.db._dynamoGet('football_games', { id: gameId });
    if (!existingGameResult.Item) {
      throw new Error('Football game not found');
    }

    const updateData = {
      start_time: startTime,
      updated_at: new Date().toISOString()
    };

    await this.db._dynamoUpdate('football_games', { id: gameId }, updateData);

    // Return updated game
    const updatedResult = await this.db._dynamoGet('football_games', { id: gameId });
    return updatedResult.Item;
  }
}