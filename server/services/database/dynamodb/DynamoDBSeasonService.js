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
    try {
      // First try scan with filter
      const result = await this.db._dynamoScan('seasons', {
        is_current: true
      });

      if (result.Items && result.Items.length > 0) {
        // Handle multiple current seasons by returning the most recent and fixing the inconsistency
        if (result.Items.length > 1) {
          console.warn(`[DynamoDB Season] Found ${result.Items.length} seasons marked as current! Fixing inconsistency...`);
          await this.fixMultipleCurrentSeasons(result.Items);
        }
        return result.Items[0];
      }

      // Fallback: scan all seasons and filter in memory
      console.log(`[DynamoDB Season] Scan filter failed for current season, using fallback`);
      const allSeasonsResult = await this.db._dynamoScan('seasons');
      if (allSeasonsResult.Items) {
        const currentSeasons = allSeasonsResult.Items.filter(s => s.is_current === true);
        if (currentSeasons.length > 0) {
          if (currentSeasons.length > 1) {
            console.warn(`[DynamoDB Season] Found ${currentSeasons.length} seasons marked as current! Fixing inconsistency...`);
            await this.fixMultipleCurrentSeasons(currentSeasons);
          }
          console.log(`[DynamoDB Season] Found current season via fallback: ${currentSeasons[0].season}`);
          return currentSeasons[0];
        }
      }
      
      return null;
    } catch (error) {
      console.error(`[DynamoDB Season] Error in getCurrentSeason:`, error);
      
      // Final fallback: scan all and filter
      try {
        const allSeasonsResult = await this.db._dynamoScan('seasons');
        if (allSeasonsResult.Items) {
          const currentSeasons = allSeasonsResult.Items.filter(s => s.is_current === true);
          if (currentSeasons.length > 1) {
            console.warn(`[DynamoDB Season] Found ${currentSeasons.length} seasons marked as current in fallback! Fixing...`);
            await this.fixMultipleCurrentSeasons(currentSeasons);
          }
          return currentSeasons.length > 0 ? currentSeasons[0] : null;
        }
      } catch (fallbackError) {
        console.error(`[DynamoDB Season] Fallback also failed:`, fallbackError);
      }
      
      return null;
    }
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
    try {
      // First try scan with filter
      const result = await this.db._dynamoScan('seasons', { season: year });
      if (result.Items && result.Items.length > 0) {
        return result.Items[0];
      }

      // Fallback: scan all seasons and filter in memory for reliability
      console.log(`[DynamoDB Season] Scan filter failed for year ${year}, using fallback`);
      const allSeasonsResult = await this.db._dynamoScan('seasons');
      if (allSeasonsResult.Items) {
        const matchingSeason = allSeasonsResult.Items.find(s => s.season === year);
        if (matchingSeason) {
          console.log(`[DynamoDB Season] Found existing season via fallback: ${year}`);
          return matchingSeason;
        }
      }
      
      return null;
    } catch (error) {
      console.error(`[DynamoDB Season] Error in getSeasonByYear for ${year}:`, error);
      
      // Final fallback: scan all and filter
      try {
        const allSeasonsResult = await this.db._dynamoScan('seasons');
        if (allSeasonsResult.Items) {
          return allSeasonsResult.Items.find(s => s.season === year) || null;
        }
      } catch (fallbackError) {
        console.error(`[DynamoDB Season] Fallback also failed:`, fallbackError);
      }
      
      return null;
    }
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
      season,
      is_current: isCurrent,
      game_count: 0,
      football_games_count: 0,
      year: parseInt(season),
      is_active: Boolean(isCurrent)
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

    // Filter out preseason games (season_type = 1)
    games = games.filter(game => game.season_type !== 1);

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

  /**
   * Find team by team code
   * @param {string} teamCode - Team code (e.g., 'KC', 'SF')
   * @returns {Promise<Object|null>} Team or null
   */
  async getTeamByCode(teamCode) {
    try {
      // First try scan with filter
      const result = await this.db._dynamoScan('football_teams', {
        team_code: teamCode
      });
      
      if (result.Items && result.Items.length > 0) {
        return result.Items[0];
      }

      // Fallback: scan all teams and filter in memory for reliability
      console.log(`[DynamoDB Team] Scan filter failed for team code ${teamCode}, using fallback`);
      const allTeamsResult = await this.db._dynamoScan('football_teams');
      if (allTeamsResult.Items) {
        const matchingTeam = allTeamsResult.Items.find(t => t.team_code === teamCode);
        if (matchingTeam) {
          console.log(`[DynamoDB Team] Found existing team via fallback: ${teamCode}`);
          return matchingTeam;
        }
      }
      
      return null;
    } catch (error) {
      console.error(`[DynamoDB Team] Error in getTeamByCode for ${teamCode}:`, error);
      
      // Final fallback: scan all and filter
      try {
        const allTeamsResult = await this.db._dynamoScan('football_teams');
        if (allTeamsResult.Items) {
          return allTeamsResult.Items.find(t => t.team_code === teamCode) || null;
        }
      } catch (fallbackError) {
        console.error(`[DynamoDB Team] Fallback also failed:`, fallbackError);
      }
      
      return null;
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
      // Get pickem game count
      const pickemGamesResult = await this.db._dynamoScan('pickem_games', { season_id: season.id });
      const game_count = pickemGamesResult.Items ? pickemGamesResult.Items.length : 0;
      
      // Get football game count
      const footballGamesResult = await this.db._dynamoScan('football_games', { season_id: season.id });
      const football_games_count = footballGamesResult.Items ? footballGamesResult.Items.length : 0;
      
      return {
        ...season,
        game_count,
        football_games_count,
        year: parseInt(season.season), // Convert to integer
        is_active: Boolean(season.is_current)
      };
    }));
    
    // Sort by season descending
    return seasonsWithCounts.sort((a, b) => b.season.localeCompare(a.season));
  }
}