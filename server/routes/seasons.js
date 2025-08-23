import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import db from '../models/database.js';
import DatabaseProviderFactory from '../providers/DatabaseProviderFactory.js';
import espnService from '../services/espnApi.js';

const router = express.Router();

// Get all seasons
router.get('/', async (req, res) => {
  try {
    let seasons;
    
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB: scan all seasons
      const seasonsResult = await db.all({
        action: 'scan',
        table: 'seasons'
      });
      seasons = seasonsResult || [];
      
      // Sort by season DESC
      seasons.sort((a, b) => b.season.localeCompare(a.season));
    } else {
      // SQLite: direct SQL query
      seasons = await db.all(`
        SELECT * FROM seasons
        ORDER BY season DESC
      `);
    }

    res.json({ seasons });
  } catch (error) {
    console.error('Get seasons error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current season
router.get('/current', async (req, res) => {
  try {
    // Handle both SQLite (is_current = 1) and DynamoDB (is_current = true)
    let currentSeason;
    if (db.getType && db.getType() === 'dynamodb') {
      // For DynamoDB, use scan with boolean true
      const seasons = await db.all({
        action: 'scan',
        table: 'seasons',
        conditions: { is_current: true }
      });
      currentSeason = seasons && seasons.length > 0 ? seasons[0] : null;
    } else {
      // For SQLite, use SQL with numeric 1
      currentSeason = await db.get(`
        SELECT * FROM seasons
        WHERE is_current = 1
      `);
    }

    if (!currentSeason) {
      return res.status(404).json({ error: 'No current season set' });
    }

    res.json({ season: currentSeason });
  } catch (error) {
    console.error('Get current season error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current season status from ESPN
router.get('/status', async (req, res) => {
  try {
    const seasonStatus = await espnService.getCurrentSeasonStatus();
    res.json({ status: seasonStatus });
  } catch (error) {
    console.error('Get season status error:', error);
    res.status(500).json({ error: 'Failed to get season status' });
  }
});

// Get season by ID
router.get('/:seasonId', async (req, res) => {
  try {
    const { seasonId } = req.params;
    let season;
    
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB: get by ID
      const seasonResult = await db.get({
        action: 'get',
        table: 'seasons',
        key: { id: seasonId }
      });
      season = seasonResult;
    } else {
      // SQLite: direct SQL query
      season = await db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
    }
    
    if (!season) {
      return res.status(404).json({ error: 'Season not found' });
    }

    res.json({ season });
  } catch (error) {
    console.error('Get season error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new season (admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { season, isCurrent = false } = req.body;

    if (!season) {
      return res.status(400).json({ error: 'Season is required' });
    }

    // Check if season already exists
    let existingSeason;
    
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB: scan for existing season
      const seasonsResult = await db.all({
        action: 'scan',
        table: 'seasons',
        conditions: { season: season }
      });
      existingSeason = seasonsResult && seasonsResult.length > 0 ? seasonsResult[0] : null;
    } else {
      // SQLite: direct SQL query
      existingSeason = await db.get('SELECT id FROM seasons WHERE season = ?', [season]);
    }
    
    if (existingSeason) {
      return res.status(409).json({ error: 'Season already exists' });
    }

    // If this is to be the current season, unset the previous current season
    if (isCurrent) {
      if (db.getType && db.getType() === 'dynamodb') {
        // For DynamoDB, scan all seasons and update them to false
        const allSeasons = await db.all({
          action: 'scan',
          table: 'seasons'
        });
        
        for (const existingSeason of allSeasons || []) {
          await db.run({
            action: 'update',
            table: 'seasons',
            key: { id: existingSeason.id },
            item: { is_current: false }
          });
        }
      } else {
        // For SQLite, use SQL
        await db.run('UPDATE seasons SET is_current = 0');
      }
    }

    const seasonId = uuidv4();
    
    if (db.getType && db.getType() === 'dynamodb') {
      // For DynamoDB, use put operation
      await db.run({
        action: 'put',
        table: 'seasons',
        item: {
          id: seasonId,
          season: season,
          is_current: isCurrent || false
        }
      });
    } else {
      // For SQLite, use SQL
      await db.run(`
        INSERT INTO seasons (id, season, is_current)
        VALUES (?, ?, ?)
      `, [seasonId, season, isCurrent ? 1 : 0]);
    }

    const newSeason = db.getType && db.getType() === 'dynamodb'
      ? await db.get({ action: 'get', table: 'seasons', key: { id: seasonId } })
      : await db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);

    res.status(201).json({
      message: 'Season created successfully',
      season: newSeason
    });

  } catch (error) {
    console.error('Create season error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update season (admin only)
router.put('/:seasonId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { seasonId } = req.params;
    const { season, isCurrent } = req.body;

    let existingSeason;
    
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB: get by ID
      const seasonResult = await db.get({
        action: 'get',
        table: 'seasons',
        key: { id: seasonId }
      });
      existingSeason = seasonResult;
    } else {
      // SQLite: direct SQL query
      existingSeason = await db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
    }
    
    if (!existingSeason) {
      return res.status(404).json({ error: 'Season not found' });
    }

    // If updating to be current season, unset previous current
    if (isCurrent && !existingSeason.is_current) {
      if (db.getType && db.getType() === 'dynamodb') {
        // For DynamoDB, scan all seasons and update them to false
        const allSeasons = await db.all({
          action: 'scan',
          table: 'seasons'
        });
        
        for (const s of allSeasons || []) {
          if (s.id !== seasonId) {
            await db.run({
              action: 'update',
              table: 'seasons',
              key: { id: s.id },
              item: { is_current: false }
            });
          }
        }
      } else {
        // For SQLite, use SQL
        await db.run('UPDATE seasons SET is_current = 0');
      }
    }

    if (db.getType && db.getType() === 'dynamodb') {
      // For DynamoDB, use update operation
      await db.run({
        action: 'update',
        table: 'seasons',
        key: { id: seasonId },
        item: {
          season: season || existingSeason.season,
          is_current: isCurrent !== undefined ? Boolean(isCurrent) : Boolean(existingSeason.is_current)
        }
      });
    } else {
      // For SQLite, use SQL
      await db.run(`
        UPDATE seasons
        SET season = ?, is_current = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [
        season || existingSeason.season,
        isCurrent !== undefined ? (isCurrent ? 1 : 0) : existingSeason.is_current,
        seasonId
      ]);
    }

    const updatedSeason = db.getType && db.getType() === 'dynamodb'
      ? await db.get({ action: 'get', table: 'seasons', key: { id: seasonId } })
      : await db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);

    res.json({
      message: 'Season updated successfully',
      season: updatedSeason
    });

  } catch (error) {
    console.error('Update season error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set current season (admin only)
router.put('/:seasonId/current', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { seasonId } = req.params;

    let season;
    
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB: get by ID
      const seasonResult = await db.get({
        action: 'get',
        table: 'seasons',
        key: { id: seasonId }
      });
      season = seasonResult;
    } else {
      // SQLite: direct SQL query
      season = await db.get('SELECT id FROM seasons WHERE id = ?', [seasonId]);
    }
    
    if (!season) {
      return res.status(404).json({ error: 'Season not found' });
    }

    if (db.getType && db.getType() === 'dynamodb') {
      // For DynamoDB, scan all seasons and update them
      const allSeasons = await db.all({
        action: 'scan',
        table: 'seasons'
      });
      
      for (const s of allSeasons || []) {
        await db.run({
          action: 'update',
          table: 'seasons',
          key: { id: s.id },
          item: { is_current: s.id === seasonId ? true : false }
        });
      }
    } else {
      // For SQLite, use SQL
      // Unset all current seasons
      await db.run('UPDATE seasons SET is_current = 0');
      
      // Set this season as current
      await db.run('UPDATE seasons SET is_current = 1 WHERE id = ?', [seasonId]);
    }

    res.json({ message: 'Current season updated successfully' });

  } catch (error) {
    console.error('Set current season error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete season (admin only)
router.delete('/:seasonId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { seasonId } = req.params;

    let existingSeason;
    
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB: get by ID
      const seasonResult = await db.get({
        action: 'get',
        table: 'seasons',
        key: { id: seasonId }
      });
      existingSeason = seasonResult;
    } else {
      // SQLite: direct SQL query
      existingSeason = await db.get('SELECT id FROM seasons WHERE id = ?', [seasonId]);
    }
    
    if (!existingSeason) {
      return res.status(404).json({ error: 'Season not found' });
    }

    // Check if season has associated games
    let gameCount;
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB: scan for games with this season_id
      const gamesResult = await db.all({
        action: 'scan',
        table: 'football_games',
        conditions: { season_id: seasonId }
      });
      gameCount = { count: (gamesResult || []).length };
    } else {
      // SQLite: count games
      gameCount = await db.get('SELECT COUNT(*) as count FROM football_games WHERE season_id = ?', [seasonId]);
    }
    
    if (gameCount.count > 0) {
      return res.status(400).json({
        error: 'Cannot delete season that has associated games'
      });
    }

    // Delete the season
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB: delete item
      await db.run({
        action: 'delete',
        table: 'seasons',
        key: { id: seasonId }
      });
    } else {
      // SQLite: delete query
      await db.run('DELETE FROM seasons WHERE id = ?', [seasonId]);
    }

    res.json({ message: 'Season deleted successfully' });

  } catch (error) {
    console.error('Delete season error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get NFL games for a season
router.get('/:seasonId/games', async (req, res) => {
  try {
    const { seasonId } = req.params;
    const { week } = req.query;

    // Check if we're using DynamoDB or SQLite
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB implementation
      let gameConditions = { season_id: seasonId };
      if (week) {
        gameConditions.week = parseInt(week);
      }

      const gamesResult = await db.all({
        action: 'scan',
        table: 'football_games',
        conditions: gameConditions
      });

      const games = gamesResult || [];
      
      // For each game, get team information
      const enrichedGames = [];
      for (const game of games) {
        // Get home team
        const homeTeamResult = await db.get({
          action: 'get',
          table: 'football_teams',
          key: { id: game.home_team_id }
        });
        const homeTeam = homeTeamResult || {};

        // Get away team
        const awayTeamResult = await db.get({
          action: 'get',
          table: 'football_teams',
          key: { id: game.away_team_id }
        });
        const awayTeam = awayTeamResult || {};

        enrichedGames.push({
          ...game,
          home_team_city: homeTeam.team_city,
          home_team_name: homeTeam.team_name,
          home_team_code: homeTeam.team_code,
          home_team_primary_color: homeTeam.team_primary_color,
          home_team_secondary_color: homeTeam.team_secondary_color,
          home_team_logo: homeTeam.team_logo,
          away_team_city: awayTeam.team_city,
          away_team_name: awayTeam.team_name,
          away_team_code: awayTeam.team_code,
          away_team_primary_color: awayTeam.team_primary_color,
          away_team_secondary_color: awayTeam.team_secondary_color,
          away_team_logo: awayTeam.team_logo
        });
      }

      // Sort games by week, then by start_time
      enrichedGames.sort((a, b) => {
        if (a.week !== b.week) {
          return a.week - b.week;
        }
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });

      res.json({ games: enrichedGames });
    } else {
      // SQLite implementation (existing code)
      let query = `
        SELECT
          ng.*,
          ht.team_city as home_team_city,
          ht.team_name as home_team_name,
          ht.team_code as home_team_code,
          ht.team_primary_color as home_team_primary_color,
          ht.team_secondary_color as home_team_secondary_color,
          ht.team_logo as home_team_logo,
          at.team_city as away_team_city,
          at.team_name as away_team_name,
          at.team_code as away_team_code,
          at.team_primary_color as away_team_primary_color,
          at.team_secondary_color as away_team_secondary_color,
          at.team_logo as away_team_logo
        FROM football_games ng
        JOIN football_teams ht ON ng.home_team_id = ht.id
        JOIN football_teams at ON ng.away_team_id = at.id
        WHERE ng.season_id = ?
      `;
      
      const params = [seasonId];
      
      if (week) {
        query += ' AND ng.week = ?';
        params.push(parseInt(week));
      }
      
      query += ' ORDER BY ng.week, ng.start_time';

      const games = await db.all(query, params);
      res.json({ games });
    }
  } catch (error) {
    console.error('Get season games error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;