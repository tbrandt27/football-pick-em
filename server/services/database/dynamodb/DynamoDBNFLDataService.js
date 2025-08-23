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
    const result = await this.db._dynamoScan('football_teams', {
      team_code: teamCode
    });
    
    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
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
        updates.updated_at = new Date().toISOString();
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
    
    const result = await this.db._dynamoScan('football_games', {
      season_id: seasonId,
      week: week,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId
    });
    
    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
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
      ...updates,
      updated_at: new Date().toISOString()
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
    const result = await this.db._dynamoScan('seasons', {
      is_current: true
    });

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  }
}