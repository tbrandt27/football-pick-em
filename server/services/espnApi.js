import axios from 'axios';
import db from '../models/database.js';
import { v4 as uuidv4 } from 'uuid';

class ESPNService {
  constructor() {
    this.baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
    this.timeout = 10000; // 10 seconds
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
      const currentYear = year || await this.fetchCurrentSeason();
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
        games = await this.fetchWeeklyGames(week, seasonType);
      } else if (week) {
        // Fetch specific week (regular season)
        games = await this.fetchWeeklyGames(week);
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
        const existingGame = await db.get(`
          SELECT id FROM nfl_games 
          WHERE season_id = ? AND week = ? AND home_team_id = ? AND away_team_id = ?
        `, [seasonId, gameData.week, homeTeamRecord.id, awayTeamRecord.id]);

        const gameDate = new Date(gameData.date);
        const startTime = new Date(competition.date);

        if (existingGame) {
          // Update existing game
          await db.run(`
            UPDATE nfl_games 
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
          updatedCount++;
        } else {
          // Create new game
          await db.run(`
            INSERT INTO nfl_games (
              id, season_id, week, home_team_id, away_team_id,
              home_score, away_score, game_date, start_time, status, season_type, scores_updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `, [
            uuidv4(),
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
      // First try to find by abbreviation
      let team = await db.get('SELECT * FROM nfl_teams WHERE team_code = ?', [teamData.abbreviation]);
      
      if (!team) {
        // Create new team
        const teamId = uuidv4();
        await db.run(`
          INSERT INTO nfl_teams (
            id, team_code, team_name, team_city, team_conference, team_division,
            team_logo, team_primary_color, team_secondary_color
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          teamId,
          teamData.abbreviation,
          teamData.name,
          teamData.location,
          'Unknown', // ESPN doesn't provide conference in this endpoint
          'Unknown', // ESPN doesn't provide division in this endpoint
          null, // Don't use ESPN logos
          teamData.color ? `#${teamData.color}` : null,
          teamData.alternateColor ? `#${teamData.alternateColor}` : null
        ]);

        team = await db.get('SELECT * FROM nfl_teams WHERE id = ?', [teamId]);
        console.log(`Created new team: ${teamData.location} ${teamData.name}`);
      } else {
        // Update team info if we have new data, but don't use ESPN logos
        await db.run(`
          UPDATE nfl_teams 
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
      const currentSeason = await db.get('SELECT * FROM seasons WHERE is_current = 1');
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