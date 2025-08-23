import { v4 as uuidv4 } from 'uuid';
import INFLDataService from '../interfaces/INFLDataService.js';
import db from '../../../models/database.js';

/**
 * SQLite-specific NFL Data Service
 * Implements NFL team and game operations using SQLite database provider
 */
export default class SQLiteNFLDataService extends INFLDataService {
  /**
   * Find team by team code
   * @param {string} teamCode - Team code (e.g., 'KC', 'SF')
   * @returns {Promise<Object|null>} Team or null
   */
  async getTeamByCode(teamCode) {
    return await db.get('SELECT * FROM football_teams WHERE team_code = ?', [teamCode]);
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
      // Update existing team only if fields are empty
      const updates = [];
      const params = [];
      
      if (teamName && !existingTeam.team_name) {
        updates.push('team_name = ?');
        params.push(teamName);
      }
      if (teamCity && !existingTeam.team_city) {
        updates.push('team_city = ?');
        params.push(teamCity);
      }
      if (conference && !existingTeam.team_conference) {
        updates.push('team_conference = ?');
        params.push(conference);
      }
      if (division && !existingTeam.team_division) {
        updates.push('team_division = ?');
        params.push(division);
      }
      if (primaryColor && !existingTeam.team_primary_color) {
        updates.push('team_primary_color = ?');
        params.push(primaryColor);
      }
      if (secondaryColor && !existingTeam.team_secondary_color) {
        updates.push('team_secondary_color = ?');
        params.push(secondaryColor);
      }
      
      if (updates.length > 0) {
        updates.push('updated_at = datetime("now")');
        params.push(existingTeam.id);
        
        await db.run(`
          UPDATE football_teams 
          SET ${updates.join(', ')}
          WHERE id = ?
        `, params);
        
        return await db.get('SELECT * FROM football_teams WHERE id = ?', [existingTeam.id]);
      }
      
      return existingTeam;
    } else {
      // Create new team
      const teamId = uuidv4();
      
      await db.run(`
        INSERT INTO football_teams (
          id, team_code, team_name, team_city, team_conference, team_division,
          team_logo, team_primary_color, team_secondary_color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        teamId,
        teamCode,
        teamName,
        teamCity,
        conference || 'Unknown',
        division || 'Unknown',
        null,
        primaryColor || null,
        secondaryColor || null
      ]);
      
      return await db.get('SELECT * FROM football_teams WHERE id = ?', [teamId]);
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
    
    return await db.get(`
      SELECT id FROM football_games
      WHERE season_id = ? AND week = ? AND home_team_id = ? AND away_team_id = ?
    `, [seasonId, week, homeTeamId, awayTeamId]);
  }

  /**
   * Create football game
   * @param {Object} gameData - Game data
   * @returns {Promise<Object>} Created game
   */
  async createFootballGame(gameData) {
    const gameId = uuidv4();
    
    const {
      season_id, week, home_team_id, away_team_id,
      home_score, away_score, game_date, start_time, status, season_type, scores_updated_at
    } = gameData;
    
    await db.run(`
      INSERT INTO football_games (
        id, season_id, week, home_team_id, away_team_id,
        home_score, away_score, game_date, start_time, status, season_type, scores_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      gameId, season_id, week, home_team_id, away_team_id,
      home_score || 0, away_score || 0, game_date, start_time, status, season_type
    ]);
    
    return await db.get('SELECT * FROM football_games WHERE id = ?', [gameId]);
  }

  /**
   * Update football game
   * @param {string} gameId - Game ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated game
   */
  async updateFootballGame(gameId, updates) {
    const existingGame = await db.get('SELECT * FROM football_games WHERE id = ?', [gameId]);
    if (!existingGame) {
      throw new Error('Football game not found');
    }

    const {
      home_score, away_score, status, game_date, start_time, season_type, scores_updated_at
    } = updates;

    await db.run(`
      UPDATE football_games
      SET home_score = ?, away_score = ?, status = ?,
          game_date = ?, start_time = ?, season_type = ?, updated_at = datetime('now'), scores_updated_at = datetime('now')
      WHERE id = ?
    `, [
      home_score || existingGame.home_score,
      away_score || existingGame.away_score,
      status || existingGame.status,
      game_date || existingGame.game_date,
      start_time || existingGame.start_time,
      season_type || existingGame.season_type,
      gameId
    ]);

    return await db.get('SELECT * FROM football_games WHERE id = ?', [gameId]);
  }

  /**
   * Get current season (from seasons table)
   * @returns {Promise<Object|null>} Current season or null
   */
  async getCurrentSeason() {
    return await db.get(`
      SELECT * FROM seasons
      WHERE is_current = 1
    `);
  }

  /**
   * Get football games by season and week
   * @param {string} seasonId - Season ID
   * @param {number} week - Week number
   * @returns {Promise<Array>} Football games
   */
  async getGamesBySeasonAndWeek(seasonId, week) {
    return await db.all(`
      SELECT * FROM football_games
      WHERE season_id = ? AND week = ?
      ORDER BY start_time
    `, [seasonId, parseInt(week)]);
  }

  /**
   * Get football games by season
   * @param {string} seasonId - Season ID
   * @returns {Promise<Array>} Football games
   */
  async getGamesBySeason(seasonId) {
    return await db.all(`
      SELECT * FROM football_games
      WHERE season_id = ?
      ORDER BY week, start_time
    `, [seasonId]);
  }

  /**
   * Get football game by ID
   * @param {string} gameId - Football game ID
   * @returns {Promise<Object|null>} Football game or null
   */
  async getFootballGameById(gameId) {
    return await db.get(`
      SELECT * FROM football_games
      WHERE id = ?
    `, [gameId]);
  }
}