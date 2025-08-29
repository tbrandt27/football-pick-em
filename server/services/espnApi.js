import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import DatabaseServiceFactory from './database/DatabaseServiceFactory.js';

class ESPNService {
  constructor() {
    this.baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
    this.timeout = 15000; // 15 seconds - increased for better reliability
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second base delay
    this.nflDataService = null; // Will be initialized when needed
    this.seasonService = null; // Will be initialized when needed
    this.consecutiveFailures = 0;
    this.lastSuccessfulRequest = new Date();
    
    // Add caching
    this.cache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheExpiry = {
      scoreboard: 5 * 60 * 1000, // 5 minutes for scoreboard data
      season: 60 * 60 * 1000,    // 1 hour for season info
      schedule: 30 * 60 * 1000   // 30 minutes for schedule data
    };
  }

  getNFLDataService() {
    if (!this.nflDataService) {
      this.nflDataService = DatabaseServiceFactory.getNFLDataService();
    }
    return this.nflDataService;
  }

  getSeasonService() {
    if (!this.seasonService) {
      this.seasonService = DatabaseServiceFactory.getSeasonService();
    }
    return this.seasonService;
  }

  /**
   * Generate cache key for request
   */
  generateCacheKey(endpoint, params = {}) {
    const paramsString = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
    return `${endpoint}?${paramsString}`;
  }

  /**
   * Get cached response if valid
   */
  getCachedResponse(cacheKey, cacheType = 'scoreboard') {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      this.cacheMisses++;
      return null;
    }
    
    const expiry = this.cacheExpiry[cacheType] || this.cacheExpiry.scoreboard;
    const isExpired = (Date.now() - cached.timestamp) > expiry;
    
    if (isExpired) {
      this.cache.delete(cacheKey);
      this.cacheMisses++;
      return null;
    }
    
    this.cacheHits++;
    console.log(`[ESPN] Using cached response for ${cacheKey}`);
    return cached.data;
  }

  /**
   * Cache response
   */
  setCachedResponse(cacheKey, data) {
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  async makeRequest(endpoint, params = {}, cacheType = 'scoreboard') {
    // Check cache first
    const cacheKey = this.generateCacheKey(endpoint, params);
    const cachedResponse = this.getCachedResponse(cacheKey, cacheType);
    
    if (cachedResponse) {
      return cachedResponse;
    }

    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[ESPN] Making request to ${endpoint} (attempt ${attempt}/${this.maxRetries})`);
        
        const response = await axios.get(`${this.baseUrl}${endpoint}`, {
          params,
          timeout: this.timeout,
          headers: {
            'User-Agent': 'NFL-Pickem-App/1.0',
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          },
          // Add connection pooling options
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 300
        });
        
        // Request successful - reset failure counter
        this.consecutiveFailures = 0;
        this.lastSuccessfulRequest = new Date();
        
        console.log(`[ESPN] Request successful for ${endpoint} on attempt ${attempt}`);
        
        // Cache the response
        this.setCachedResponse(cacheKey, response.data);
        
        return response.data;
        
      } catch (error) {
        lastError = error;
        this.consecutiveFailures++;
        
        console.error(`[ESPN] Request failed for ${endpoint} (attempt ${attempt}/${this.maxRetries}):`, {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          consecutiveFailures: this.consecutiveFailures
        });
        
        // If this was the last attempt, don't wait
        if (attempt === this.maxRetries) {
          break;
        }
        
        // Calculate exponential backoff delay
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        console.log(`[ESPN] Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // All retries failed
    console.error(`[ESPN] All ${this.maxRetries} attempts failed for ${endpoint}`);
    throw new Error(`ESPN API request failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  async fetchCurrentSeason() {
    try {
      const data = await this.makeRequest('/scoreboard', {}, 'season');
      if (data.season && data.season.year) {
        return {
          year: data.season.year.toString(),
          type: data.season.type || 2 // 1=preseason, 2=regular, 3=postseason
        };
      }
      return {
        year: new Date().getFullYear().toString(),
        type: 2
      };
    } catch (error) {
      console.error('Failed to fetch current season:', error);
      return {
        year: new Date().getFullYear().toString(),
        type: 2
      };
    }
  }

  async fetchWeeklyGames(week = 1, seasonType = 2, year = null) {
    try {
      const seasonInfo = year ? { year: year.toString() } : await this.fetchCurrentSeason();
      const currentYear = seasonInfo.year;
      const data = await this.makeRequest('/scoreboard', {
        dates: currentYear,
        week: week,
        seasontype: seasonType // 1=preseason, 2=regular, 3=postseason
      }, 'scoreboard');

      if (!data.events || !Array.isArray(data.events)) {
        console.warn('No events found in ESPN response');
        return [];
      }

      return data.events.map(event => ({
        espnId: event.id,
        name: event.name,
        shortName: event.shortName,
        date: event.date,
        status: {
          type: event.status.type.name,
          detail: event.status.type.detail,
          completed: event.status.type.completed
        },
        week: parseInt(event.week?.number || week),
        season: parseInt(currentYear),
        seasonType: seasonType,
        competitions: event.competitions[0] ? {
          id: event.competitions[0].id,
          date: event.competitions[0].date,
          attendance: event.competitions[0].attendance,
          venue: event.competitions[0].venue ? {
            name: event.competitions[0].venue.fullName,
            city: event.competitions[0].venue.address?.city,
            state: event.competitions[0].venue.address?.state
          } : null,
          competitors: event.competitions[0].competitors.map(comp => ({
            id: comp.id,
            type: comp.homeAway, // 'home' or 'away'
            team: {
              id: comp.team.id,
              abbreviation: comp.team.abbreviation,
              displayName: comp.team.displayName,
              shortDisplayName: comp.team.shortDisplayName,
              location: comp.team.location,
              name: comp.team.name,
              color: comp.team.color,
              alternateColor: comp.team.alternateColor,
              logo: comp.team.logo
            },
            score: comp.score ? parseInt(comp.score) : 0,
            record: comp.records ? comp.records[0]?.summary : null
          }))
        } : null
      }));
    } catch (error) {
      console.error(`Failed to fetch week ${week} games:`, error);
      throw error;
    }
  }

  async fetchFullSchedule(year = null, includePreseason = false) {
    try {
      const seasonInfo = year ? { year: year.toString(), type: 2 } : await this.fetchCurrentSeason();
      const allGames = [];
      
      // Fetch preseason if requested (weeks 1-4)
      if (includePreseason) {
        for (let week = 1; week <= 4; week++) {
          try {
            console.log(`Fetching preseason week ${week} of ${seasonInfo.year}...`);
            const weekGames = await this.fetchWeeklyGames(week, 1, seasonInfo.year);
            allGames.push(...weekGames);
            
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Failed to fetch preseason week ${week}:`, error);
          }
        }
      }
      
      // Regular season is typically weeks 1-18
      for (let week = 1; week <= 18; week++) {
        try {
          console.log(`Fetching week ${week} of ${seasonInfo.year}...`);
          const weekGames = await this.fetchWeeklyGames(week, 2, seasonInfo.year);
          allGames.push(...weekGames);
          
          // Add longer delay between requests to be respectful to ESPN API
          await new Promise(resolve => setTimeout(resolve, 250));
        } catch (error) {
          console.error(`Failed to fetch week ${week}:`, error);
          // Continue with other weeks even if one fails
        }
      }

      return allGames;
    } catch (error) {
      console.error('Failed to fetch full schedule:', error);
      throw error;
    }
  }

  async updateNFLGames(seasonId, week = null, seasonType = null, scoresOnly = false) {
    try {
      let games;
      
      if (week && seasonType) {
        // Fetch specific week and season type
        const seasonInfo = await this.fetchCurrentSeason();
        games = await this.fetchWeeklyGames(week, seasonType, seasonInfo.year);
      } else if (week) {
        // Fetch specific week (regular season)
        const seasonInfo = await this.fetchCurrentSeason();
        games = await this.fetchWeeklyGames(week, 2, seasonInfo.year);
      } else {
        // Fetch all games for the season (including preseason)
        games = await this.fetchFullSchedule(null, true);
      }

      let updatedCount = 0;
      let createdCount = 0;

      for (const gameData of games) {
        if (!gameData.competitions || !gameData.competitions.competitors) {
          continue;
        }

        const competition = gameData.competitions;
        const competitors = competition.competitors;
        
        if (competitors.length < 2) {
          continue;
        }

        const homeTeam = competitors.find(c => c.type === 'home');
        const awayTeam = competitors.find(c => c.type === 'away');

        if (!homeTeam || !awayTeam) {
          continue;
        }

        const nflDataService = this.getNFLDataService();
        let homeTeamRecord, awayTeamRecord;

        if (scoresOnly) {
          // For score-only updates, find teams by their abbreviation/code
          homeTeamRecord = await nflDataService.getTeamByCode(homeTeam.team.abbreviation);
          awayTeamRecord = await nflDataService.getTeamByCode(awayTeam.team.abbreviation);
          
          if (!homeTeamRecord || !awayTeamRecord) {
            console.warn(`Teams not found for score update: ${homeTeam.team.abbreviation} vs ${awayTeam.team.abbreviation}. Skipping game.`);
            continue;
          }
        } else {
          // For full updates (schedule creation), find or create teams
          homeTeamRecord = await this.findOrCreateTeam(homeTeam.team);
          awayTeamRecord = await this.findOrCreateTeam(awayTeam.team);
        }

        // Check if game already exists using the service layer
        const existingGame = await nflDataService.findFootballGame({
          seasonId: seasonId,
          week: gameData.week,
          homeTeamId: homeTeamRecord.id,
          awayTeamId: awayTeamRecord.id
        });

        const gameDate = new Date(gameData.date);
        const startTime = new Date(competition.date);
        const now = new Date().toISOString();

        if (existingGame) {
          // Update existing game
          const updateData = {
            home_score: homeTeam.score || 0,
            away_score: awayTeam.score || 0,
            status: gameData.status.type,
            scores_updated_at: now
          };

          // Only update game date and start time if not doing scores-only update
          if (!scoresOnly) {
            updateData.game_date = gameDate.toISOString();
            updateData.start_time = startTime.toISOString();
            updateData.season_type = gameData.seasonType;
          }

          console.log(`[ESPN] Updating game ${existingGame.id} with scores_updated_at: ${now}`);
          await nflDataService.updateFootballGame(existingGame.id, updateData);
          updatedCount++;
        } else if (!scoresOnly) {
          // Only create new games if not doing scores-only update
          const gameItem = {
            season_id: seasonId,
            week: gameData.week,
            home_team_id: homeTeamRecord.id,
            away_team_id: awayTeamRecord.id,
            home_score: homeTeam.score || 0,
            away_score: awayTeam.score || 0,
            game_date: gameDate.toISOString(),
            start_time: startTime.toISOString(),
            status: gameData.status.type,
            season_type: gameData.seasonType,
            scores_updated_at: now
          };

          await nflDataService.createFootballGame(gameItem);
          createdCount++;
        }
      }

      console.log(`ESPN sync complete: ${createdCount} created, ${updatedCount} updated`);
      return { created: createdCount, updated: updatedCount };

    } catch (error) {
      console.error('Failed to update NFL games:', error);
      throw error;
    }
  }

  async findOrCreateTeam(teamData) {
    try {
      // Map ESPN team codes to our preferred codes
      const teamCodeMap = {
        'WAS': 'WSH'  // ESPN uses WAS, we prefer WSH for Washington Commanders
      };
      
      const ourTeamCode = teamCodeMap[teamData.abbreviation] || teamData.abbreviation;
      
      const nflDataService = this.getNFLDataService();
      
      // Use the service layer to create or update the team
      const team = await nflDataService.createOrUpdateTeam({
        teamCode: ourTeamCode,
        teamName: teamData.name,
        teamCity: teamData.location,
        conference: 'Unknown', // ESPN doesn't provide conference in this endpoint
        division: 'Unknown', // ESPN doesn't provide division in this endpoint
        primaryColor: teamData.color ? `#${teamData.color}` : null,
        secondaryColor: teamData.alternateColor ? `#${teamData.alternateColor}` : null
      });
      
      console.log(`Team processed: ${teamData.location} ${teamData.name}`);

      return team;
    } catch (error) {
      console.error('Failed to find or create team:', error);
      throw error;
    }
  }

  async getCurrentSeasonStatus() {
    try {
      const seasonInfo = await this.fetchCurrentSeason();
      const now = new Date();
      
      // Get current season info from ESPN
      
      let currentWeek = 1;
      let seasonType = seasonInfo.type;
      let seasonTypeText = 'Regular Season';
      
      if (seasonType === 1) {
        seasonTypeText = 'Preseason';
        // For preseason, calculate week based on date
        const preseasonStart = new Date(`${seasonInfo.year}-08-01`);
        const weeksSinceStart = Math.floor((now.getTime() - preseasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
        currentWeek = Math.max(1, Math.min(4, weeksSinceStart + 1));
      } else if (seasonType === 2) {
        seasonTypeText = 'Regular Season';
        const seasonStart = new Date(`${seasonInfo.year}-09-05`);
        const weeksSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
        currentWeek = Math.max(1, Math.min(18, weeksSinceStart + 1));
      } else if (seasonType === 3) {
        seasonTypeText = 'Postseason';
        currentWeek = 1;
      }
      
      return {
        year: seasonInfo.year,
        type: seasonType,
        typeText: seasonTypeText,
        week: currentWeek,
        isPreseason: seasonType === 1,
        isRegularSeason: seasonType === 2,
        isPostseason: seasonType === 3
      };
    } catch (error) {
      console.error('Failed to get current season status:', error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;
    
    for (const [key, value] of this.cache.entries()) {
      const age = now - value.timestamp;
      if (age > this.cacheExpiry.scoreboard) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    }
    
    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      cacheHitRatio: this.cacheHits / Math.max(1, this.cacheHits + this.cacheMisses)
    };
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache() {
    const now = Date.now();
    let cleared = 0;
    
    for (const [key, value] of this.cache.entries()) {
      const age = now - value.timestamp;
      if (age > this.cacheExpiry.scoreboard) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      console.log(`[ESPN] Cleared ${cleared} expired cache entries`);
    }
    
    return cleared;
  }

  async updateGameScores() {
    try {
      const nflDataService = this.getNFLDataService();
      const currentSeason = await nflDataService.getCurrentSeason();

      if (!currentSeason) {
        throw new Error('No current season set');
      }

      const seasonStatus = await this.getCurrentSeasonStatus();
      
      const results = [];
      const currentWeek = seasonStatus.week;
      const seasonType = seasonStatus.type;
      
      // Update current week and previous week
      for (const week of [Math.max(1, currentWeek - 1), currentWeek]) {
        const result = await this.updateNFLGames(currentSeason.id, week, seasonType);
        results.push({ week, seasonType, ...result });
      }

      return results;
    } catch (error) {
      console.error('Failed to update game scores:', error);
      throw error;
    }
  }
}

export default new ESPNService();