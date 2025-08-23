import { v4 as uuidv4 } from 'uuid';
import ISeasonService from '../interfaces/ISeasonService.js';
import db from '../../../models/database.js';

/**
 * DynamoDB-specific Season Service
 * Implements season operations using DynamoDB database provider
 */
export default class DynamoDBSeasonService extends ISeasonService {
  constructor() {
    super();
    this.db = db.provider; // Use the singleton database provider
  }

  /**
   * Get all seasons
   * @returns {Promise<Array>} All seasons ordered by season desc
   */
  async getAllSeasons() {
    const result = await this.db._dynamoScan('seasons');
    
    if (!result.Items) {
      return [];
    }

    // Sort by season descending
    return result.Items.sort((a, b) => b.season.localeCompare(a.season));
  }

  /**
   * Get current season
   * @returns {Promise<Object|null>} Current season or null
   */
  async getCurrentSeason() {
    const result = await this.db._dynamoScan('seasons', {
      is_current: true
    });

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  }

  /**
   * Get season by ID
   * @param {string} seasonId - Season ID
   * @returns {Promise<Object|null>} Season or null
   */
  async getSeasonById(seasonId) {
    const result = await this.db._dynamoGet('seasons', { id: seasonId });
    return result.Item || null;
  }

  /**
   * Create a new season
   * @param {Object} seasonData - Season data
   * @param {string} seasonData.season - Season year/identifier
   * @param {boolean} [seasonData.isCurrent] - Whether this is the current season
   * @returns {Promise<Object>} Created season
   */
  async createSeason(seasonData) {
    const { season, isCurrent = false } = seasonData;

    // Check if season already exists
    const allSeasons = await this.getAllSeasons();
    const existingSeason = allSeasons.find(s => s.season === season);
    if (existingSeason) {
      throw new Error('Season already exists');
    }

    // If this is to be the current season, unset the previous current season
    if (isCurrent) {
      const currentSeason = await this.getCurrentSeason();
      if (currentSeason) {
        await this.db._dynamoUpdate('seasons', 
          { id: currentSeason.id }, 
          { is_current: false }
        );
      }
    }

    const seasonId = uuidv4();
    const seasonItem = {
      id: seasonId,
      season,
      is_current: isCurrent
    };
    
    await this.db._dynamoPut('seasons', seasonItem);
    return seasonItem;
  }

  /**
   * Update a season
   * @param {string} seasonId - Season ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated season
   */
  async updateSeason(seasonId, updates) {
    const existingSeasonResult = await this.db._dynamoGet('seasons', { id: seasonId });
    if (!existingSeasonResult.Item) {
      throw new Error('Season not found');
    }

    const existingSeason = existingSeasonResult.Item;

    // If updating to be current season, unset previous current
    if (updates.isCurrent && !existingSeason.is_current) {
      const currentSeason = await this.getCurrentSeason();
      if (currentSeason && currentSeason.id !== seasonId) {
        await this.db._dynamoUpdate('seasons',
          { id: currentSeason.id },
          { is_current: false }
        );
      }
    }

    const updateData = {
      season: updates.season || existingSeason.season,
      is_current: updates.isCurrent !== undefined ? updates.isCurrent : existingSeason.is_current
    };

    await this.db._dynamoUpdate('seasons', { id: seasonId }, updateData);

    // Return updated season
    const updatedResult = await this.db._dynamoGet('seasons', { id: seasonId });
    return updatedResult.Item;
  }

  /**
   * Set current season
   * @param {string} seasonId - Season ID to set as current
   * @returns {Promise<void>}
   */
  async setCurrentSeason(seasonId) {
    const seasonResult = await this.db._dynamoGet('seasons', { id: seasonId });
    if (!seasonResult.Item) {
      throw new Error('Season not found');
    }

    // Unset all current seasons
    const currentSeason = await this.getCurrentSeason();
    if (currentSeason && currentSeason.id !== seasonId) {
      await this.db._dynamoUpdate('seasons',
        { id: currentSeason.id },
        { is_current: false }
      );
    }
    
    // Set this season as current
    await this.db._dynamoUpdate('seasons', 
      { id: seasonId }, 
      { is_current: true }
    );
  }

  /**
   * Delete a season
   * @param {string} seasonId - Season ID
   * @returns {Promise<void>}
   */
  async deleteSeason(seasonId) {
    const existingSeasonResult = await this.db._dynamoGet('seasons', { id: seasonId });
    if (!existingSeasonResult.Item) {
      throw new Error('Season not found');
    }

    // Check if season has associated games
    const gameCount = await this.getSeasonGameCount(seasonId);
    if (gameCount > 0) {
      throw new Error('Cannot delete season that has associated games');
    }

    await this.db._dynamoDelete('seasons', { id: seasonId });
  }

  /**
   * Get NFL games for a season
   * @param {string} seasonId - Season ID
   * @param {Object} [filters] - Optional filters
   * @param {number} [filters.week] - Week number
   * @returns {Promise<Array>} Football games with team info
   */
  async getSeasonGames(seasonId, filters = {}) {
    // Get football games for the season
    const gamesResult = await this.db._dynamoScan('football_games', {
      season_id: seasonId
    });

    if (!gamesResult.Items) {
      return [];
    }

    let games = gamesResult.Items;

    // Filter by week if specified
    if (filters.week) {
      games = games.filter(game => game.week === parseInt(filters.week));
    }

    // Get team information for each game
    const gamesWithTeams = [];
    for (const game of games) {
      const homeTeamResult = await this.db._dynamoGet('football_teams', { id: game.home_team_id });
      const awayTeamResult = await this.db._dynamoGet('football_teams', { id: game.away_team_id });

      const homeTeam = homeTeamResult.Item;
      const awayTeam = awayTeamResult.Item;

      gamesWithTeams.push({
        ...game,
        home_team_city: homeTeam?.team_city,
        home_team_name: homeTeam?.team_name,
        home_team_code: homeTeam?.team_code,
        home_team_primary_color: homeTeam?.team_primary_color,
        home_team_secondary_color: homeTeam?.team_secondary_color,
        home_team_logo: homeTeam?.team_logo,
        away_team_city: awayTeam?.team_city,
        away_team_name: awayTeam?.team_name,
        away_team_code: awayTeam?.team_code,
        away_team_primary_color: awayTeam?.team_primary_color,
        away_team_secondary_color: awayTeam?.team_secondary_color,
        away_team_logo: awayTeam?.team_logo
      });
    }

    // Sort by week, then start_time
    return gamesWithTeams.sort((a, b) => {
      if (a.week !== b.week) {
        return a.week - b.week;
      }
      return new Date(a.start_time) - new Date(b.start_time);
    });
  }

  /**
   * Check if season has associated games
   * @param {string} seasonId - Season ID
   * @returns {Promise<number>} Number of associated games
   */
  async getSeasonGameCount(seasonId) {
    const result = await this.db._dynamoScan('football_games', {
      season_id: seasonId
    });

    return result.Items ? result.Items.length : 0;
  }
}