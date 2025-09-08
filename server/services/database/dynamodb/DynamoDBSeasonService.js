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
    // Since there's only one current season, use scan directly - no GSI needed
    // This is efficient enough for a single-record lookup that happens infrequently
    console.log(`[DynamoDB Season] Getting current season via scan (single record expected)`);
    const result = await this.db._dynamoScan('seasons', { is_current: true });
    return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
  }

  /**
   * Fix inconsistent state where multiple seasons are marked as current
   * @param {Array} currentSeasons - Array of seasons marked as current
   */
  async fixMultipleCurrentSeasons(currentSeasons) {
    try {
      // Sort by season year (most recent first) and keep only the most recent as current
      const sortedSeasons = currentSeasons.sort((a, b) => parseInt(b.season) - parseInt(a.season));
      const mostRecentSeason = sortedSeasons[0];
      
      console.log(`[DynamoDB Season] Keeping ${mostRecentSeason.season} as current, unsetting others`);
      
      // Unset all others
      for (let i = 1; i < sortedSeasons.length; i++) {
        const season = sortedSeasons[i];
        console.log(`[DynamoDB Season] Unsetting ${season.season} as current`);
        await this.db._dynamoUpdate('seasons', { id: season.id }, { is_current: false });
      }
    } catch (error) {
      console.error(`[DynamoDB Season] Error fixing multiple current seasons:`, error);
    }
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
   * Get season by year
   * @param {string} year - Season year
   * @returns {Promise<Object|null>} Season or null
   */
  async getSeasonByYear(year) {
    // Use scan operation only - seasons table is small, no GSI needed
    console.log(`[DynamoDB Season] Getting season ${year} via scan`);
    const result = await this.db._dynamoScan('seasons', { season: year });
    return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
  }

  /**
   * Create a new season
   * @param {Object|string} seasonData - Season data or year string
   * @param {string} seasonData.season - Season year/identifier (if object)
   * @param {boolean} [seasonData.isCurrent] - Whether this is the current season (if object)
   * @returns {Promise<Object>} Created season
   */
  async createSeason(seasonData) {
    // Handle both string and object inputs for compatibility
    let season, isCurrent = false;
    if (typeof seasonData === 'string') {
      season = seasonData;
    } else {
      season = seasonData.season;
      isCurrent = seasonData.isCurrent || false;
    }

    // Check if season already exists
    const existingSeason = await this.getSeasonByYear(season);
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

    const seasonId = "season-" + Date.now();
    const seasonItem = {
      id: seasonId,
      season: season.toString(), // Ensure string type
      is_current: Boolean(isCurrent)
    };
    
    console.log(`[DynamoDBSeasonService] Creating season with attributes:`, {
      id: seasonItem.id,
      season: seasonItem.season,
      is_current: seasonItem.is_current,
      season_type: typeof seasonItem.season,
      is_current_type: typeof seasonItem.is_current
    });
    
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
      is_current: updates.isCurrent !== undefined ? Boolean(updates.isCurrent) : existingSeason.is_current
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
    let filteredGames;
    
    try {
      // Try GSI season_id-index for efficient lookup
      const games = await this.db._getBySeasonIdGSI('football_games', seasonId);

      if (!games) {
        return [];
      }

      filteredGames = games;
    } catch (error) {
      // Fallback to scan if GSI doesn't exist (backward compatibility)
      if (error.name === 'ResourceNotFoundException') {
        console.log(`[DynamoDB Season] GSI not found, falling back to scan for season games ${seasonId}`);
        const gamesResult = await this.db._dynamoScan('football_games', { season_id: seasonId });
        
        if (!gamesResult.Items) {
          return [];
        }

        filteredGames = gamesResult.Items;
      } else {
        throw error;
      }
    }

    // Filter out preseason games (season_type = 1)
    filteredGames = filteredGames.filter(game => game.season_type !== 1);

    // Filter by week if specified
    if (filters.week) {
      filteredGames = filteredGames.filter(game => game.week === parseInt(filters.week));
    }

    // Get team information for each game
    const gamesWithTeams = [];
    for (const game of filteredGames) {
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
    try {
      // Try GSI season_id-index for efficient lookup
      const games = await this.db._getBySeasonIdGSI('football_games', seasonId);
      return games ? games.length : 0;
    } catch (error) {
      // Fallback to scan if GSI doesn't exist (backward compatibility)
      if (error.name === 'ResourceNotFoundException') {
        console.log(`[DynamoDB Season] GSI not found, falling back to scan for season game count ${seasonId}`);
        const result = await this.db._dynamoScan('football_games', { season_id: seasonId });
        return result.Items ? result.Items.length : 0;
      }
      throw error;
    }
  }

  /**
   * Find team by team code
   * @param {string} teamCode - Team code (e.g., 'KC', 'SF')
   * @returns {Promise<Object|null>} Team or null
   */
  async getTeamByCode(teamCode) {
    try {
      // Try GSI team_code-index for efficient lookup
      return await this.db._getByTeamCodeGSI('football_teams', teamCode);
    } catch (error) {
      // Fallback to scan if GSI doesn't exist (backward compatibility)
      if (error.name === 'ResourceNotFoundException') {
        console.log(`[DynamoDB Season] GSI not found, falling back to scan for team ${teamCode}`);
        const result = await this.db._dynamoScan('football_teams', { team_code: teamCode });
        return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
      }
      throw error;
    }
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
    
    try {
      // Try GSI season_id-index and filter in memory for complex conditions
      const seasonGames = await this.db._getBySeasonIdGSI('football_games', seasonId);
      
      const matchingGame = seasonGames.find(game =>
        game.week === week &&
        game.home_team_id === homeTeamId &&
        game.away_team_id === awayTeamId
      );
      
      return matchingGame || null;
    } catch (error) {
      // Fallback to scan if GSI doesn't exist (backward compatibility)
      if (error.name === 'ResourceNotFoundException') {
        console.log(`[DynamoDB Season] GSI not found, falling back to scan for findFootballGame`);
        const result = await this.db._dynamoScan('football_games', {
          season_id: seasonId,
          week: week,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId
        });
        return (result.Items && result.Items.length > 0) ? result.Items[0] : null;
      }
      throw error;
    }
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
   * Get total count of seasons
   * @returns {Promise<number>} Total number of seasons
   */
  async getSeasonCount() {
    const result = await this.db._dynamoScan('seasons');
    return result.Items ? result.Items.length : 0;
  }

  /**
   * Get total count of football teams
   * @returns {Promise<number>} Total number of football teams
   */
  async getTeamCount() {
    const result = await this.db._dynamoScan('football_teams');
    return result.Items ? result.Items.length : 0;
  }

  /**
   * Get all seasons with game counts (for admin management)
   * @returns {Promise<Array>} Seasons with game count details
   */
  async getAllSeasonsWithCounts() {
    const result = await this.db._dynamoScan('seasons');
    const seasons = result.Items || [];
    
    // For each season, get the game counts
    const seasonsWithCounts = await Promise.all(seasons.map(async (season) => {
      let game_count = 0;
      let football_games_count = 0;
      
      try {
        // Try GSI season_id-index for efficient lookups
        const pickemGames = await this.db._getBySeasonIdGSI('pickem_games', season.id);
        game_count = pickemGames ? pickemGames.length : 0;
        
        const footballGames = await this.db._getBySeasonIdGSI('football_games', season.id);
        football_games_count = footballGames ? footballGames.length : 0;
        
        console.log(`[DynamoDB Season] Season ${season.season} counts: pickem=${game_count}, football=${football_games_count}`);
      } catch (error) {
        // Fallback to scan if GSI doesn't exist (backward compatibility)
        if (error.name === 'ResourceNotFoundException') {
          console.log(`[DynamoDB Season] GSI not found, falling back to scan for season counts ${season.id}`);
          const pickemGamesResult = await this.db._dynamoScan('pickem_games', { season_id: season.id });
          game_count = pickemGamesResult.Items ? pickemGamesResult.Items.length : 0;
          
          const footballGamesResult = await this.db._dynamoScan('football_games', { season_id: season.id });
          football_games_count = footballGamesResult.Items ? footballGamesResult.Items.length : 0;
        } else {
          console.error(`[DynamoDB Season] Error getting counts for season ${season.id}:`, error);
          // Set defaults on error to prevent frontend issues
          game_count = 0;
          football_games_count = 0;
        }
      }
      
      return {
        ...season,
        game_count,
        football_games_count,
        year: parseInt(season.season), // Convert to integer for frontend
        is_active: Boolean(season.is_current)
      };
    }));
    
    // Sort by season descending
    return seasonsWithCounts.sort((a, b) => b.season.localeCompare(a.season));
  }
}