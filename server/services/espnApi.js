import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import DatabaseProviderFactory from '../providers/DatabaseProviderFactory.js';

class ESPNService {
  constructor() {
    this.baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
    this.timeout = 10000; // 10 seconds
    this.db = null; // Will be initialized when needed
  }

  async getDb() {
    if (!this.db) {
      this.db = await DatabaseProviderFactory.createProvider();
      if (!this.db.initialized) {
        await this.db.initialize();
      }
    }
    return this.db;
  }

  async makeRequest(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params,
        timeout: this.timeout,
        headers: {
          'User-Agent': 'NFL-Pickem-App/1.0'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`ESPN API request failed for ${endpoint}:`, error.message);
      throw new Error(`Failed to fetch data from ESPN: ${error.message}`);
    }
  }

  async fetchCurrentSeason() {
    try {
      const data = await this.makeRequest('/scoreboard');
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
      });

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
          
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to fetch week ${week}:`, error);
        }
      }

      return allGames;
    } catch (error) {
      console.error('Failed to fetch full schedule:', error);
      throw error;
    }
  }

  async updateNFLGames(seasonId, week = null, seasonType = null) {
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

        // Find or create teams in our database
        const homeTeamRecord = await this.findOrCreateTeam(homeTeam.team);
        const awayTeamRecord = await this.findOrCreateTeam(awayTeam.team);

        // Check if game already exists
        const db = await this.getDb();
        let existingGame;
        if (db.getType && db.getType() === 'dynamodb') {
          // DynamoDB: scan with filters
          const games = await db.all({
            action: 'scan',
            table: 'football_games',
            conditions: {
              season_id: seasonId,
              week: gameData.week,
              home_team_id: homeTeamRecord.id,
              away_team_id: awayTeamRecord.id
            }
          });
          existingGame = games && games.length > 0 ? games[0] : null;
        } else {
          // SQLite: direct SQL query
          existingGame = await db.get(`
            SELECT id FROM football_games
            WHERE season_id = ? AND week = ? AND home_team_id = ? AND away_team_id = ?
          `, [seasonId, gameData.week, homeTeamRecord.id, awayTeamRecord.id]);
        }

        const gameDate = new Date(gameData.date);
        const startTime = new Date(competition.date);
        const now = new Date().toISOString();

        if (existingGame) {
          // Update existing game
          const updateData = {
            home_score: homeTeam.score || 0,
            away_score: awayTeam.score || 0,
            status: gameData.status.type,
            game_date: gameDate.toISOString(),
            start_time: startTime.toISOString(),
            season_type: gameData.seasonType,
            scores_updated_at: now
          };

          if (db.getType && db.getType() === 'dynamodb') {
            await db.run({
              action: 'update',
              table: 'football_games',
              key: { id: existingGame.id },
              item: updateData
            });
          } else {
            await db.run(`
              UPDATE football_games
              SET home_score = ?, away_score = ?, status = ?,
                  game_date = ?, start_time = ?, season_type = ?, updated_at = datetime('now'), scores_updated_at = datetime('now')
              WHERE id = ?
            `, [
              homeTeam.score || 0,
              awayTeam.score || 0,
              gameData.status.type,
              gameDate.toISOString(),
              startTime.toISOString(),
              gameData.seasonType,
              existingGame.id
            ]);
          }
          updatedCount++;
        } else {
          // Create new game
          const gameId = uuidv4();
          const gameItem = {
            id: gameId,
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
            scores_updated_at: now,
            created_at: now,
            updated_at: now
          };

          if (db.getType && db.getType() === 'dynamodb') {
            await db.run({
              action: 'put',
              table: 'football_games',
              item: gameItem
            });
          } else {
            await db.run(`
              INSERT INTO football_games (
                id, season_id, week, home_team_id, away_team_id,
                home_score, away_score, game_date, start_time, status, season_type, scores_updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `, [
              gameId,
              seasonId,
              gameData.week,
              homeTeamRecord.id,
              awayTeamRecord.id,
              homeTeam.score || 0,
              awayTeam.score || 0,
              gameDate.toISOString(),
              startTime.toISOString(),
              gameData.status.type,
              gameData.seasonType
            ]);
          }
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
      
      // Check database type and use appropriate query method
      const db = await this.getDb();
      let team;
      if (db.getType && db.getType() === 'dynamodb') {
        // DynamoDB: scan with filter
        const teams = await db.all({
          action: 'scan',
          table: 'football_teams',
          conditions: { team_code: ourTeamCode }
        });
        team = teams && teams.length > 0 ? teams[0] : null;
      } else {
        // SQLite: direct SQL query
        team = await db.get('SELECT * FROM football_teams WHERE team_code = ?', [ourTeamCode]);
      }
      
      if (!team) {
        // Create new team
        const teamId = uuidv4();
        const now = new Date().toISOString();
        
        if (db.getType && db.getType() === 'dynamodb') {
          // DynamoDB: use PUT operation
          const teamItem = {
            id: teamId,
            team_code: ourTeamCode,
            team_name: teamData.name,
            team_city: teamData.location,
            team_conference: 'Unknown', // ESPN doesn't provide conference in this endpoint
            team_division: 'Unknown', // ESPN doesn't provide division in this endpoint
            team_logo: null, // Don't use ESPN logos
            team_primary_color: teamData.color ? `#${teamData.color}` : null,
            team_secondary_color: teamData.alternateColor ? `#${teamData.alternateColor}` : null,
            created_at: now,
            updated_at: now
          };
          
          await db.run({
            action: 'put',
            table: 'football_teams',
            item: teamItem
          });
          
          team = teamItem;
        } else {
          // SQLite: use SQL INSERT
          await db.run(`
            INSERT INTO football_teams (
              id, team_code, team_name, team_city, team_conference, team_division,
              team_logo, team_primary_color, team_secondary_color
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            teamId,
            ourTeamCode, // Use our mapped team code
            teamData.name,
            teamData.location,
            'Unknown', // ESPN doesn't provide conference in this endpoint
            'Unknown', // ESPN doesn't provide division in this endpoint
            null, // Don't use ESPN logos
            teamData.color ? `#${teamData.color}` : null,
            teamData.alternateColor ? `#${teamData.alternateColor}` : null
          ]);

          team = await db.get('SELECT * FROM football_teams WHERE id = ?', [teamId]);
        }
        
        console.log(`Created new team: ${teamData.location} ${teamData.name}`);
      } else if (teamData.color || teamData.alternateColor) {
        // Update team info if we have new data, but don't use ESPN logos
        if (db.getType && db.getType() === 'dynamodb') {
          // DynamoDB: use UPDATE operation
          const updates = {};
          if (teamData.color && !team.team_primary_color) {
            updates.team_primary_color = `#${teamData.color}`;
          }
          if (teamData.alternateColor && !team.team_secondary_color) {
            updates.team_secondary_color = `#${teamData.alternateColor}`;
          }
          
          if (Object.keys(updates).length > 0) {
            await db.run({
              action: 'update',
              table: 'football_teams',
              key: { id: team.id },
              item: updates
            });
            // Update local team object
            Object.assign(team, updates);
          }
        } else {
          // SQLite: use SQL UPDATE
          await db.run(`
            UPDATE football_teams
            SET team_primary_color = COALESCE(?, team_primary_color),
                team_secondary_color = COALESCE(?, team_secondary_color),
                updated_at = datetime('now')
            WHERE id = ?
          `, [
            teamData.color ? `#${teamData.color}` : null,
            teamData.alternateColor ? `#${teamData.alternateColor}` : null,
            team.id
          ]);
        }
      }

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

  async updateGameScores() {
    try {
      const db = await this.getDb();
      let currentSeason;
      if (db.getType && db.getType() === 'dynamodb') {
        // DynamoDB: scan with filter
        const seasons = await db.all({
          action: 'scan',
          table: 'seasons',
          conditions: { is_current: true }
        });
        currentSeason = seasons && seasons.length > 0 ? seasons[0] : null;
      } else {
        // SQLite: direct SQL query
        currentSeason = await db.get('SELECT * FROM seasons WHERE is_current = 1');
      }

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