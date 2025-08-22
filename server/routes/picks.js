import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import db from '../models/database.js';

const router = express.Router();

// Get user's picks for a game/season/week
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { gameId, seasonId, week, userId } = req.query;

    // Users can only see their own picks unless they're admin or in the same game
    const targetUserId = userId || req.user.id;
    
    if (targetUserId !== req.user.id && !req.user.is_admin) {
      // Check if they're in the same game
      if (gameId) {
        const sameGame = await db.get(`
          SELECT 1 FROM game_participants gp1
          JOIN game_participants gp2 ON gp1.game_id = gp2.game_id
          WHERE gp1.user_id = ? AND gp2.user_id = ? AND gp1.game_id = ?
        `, [req.user.id, targetUserId, gameId]);
        
        if (!sameGame) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    let query = `
      SELECT 
        p.*,
        ng.week,
        ng.start_time,
        ng.status as game_status,
        ht.team_city as home_team_city,
        ht.team_name as home_team_name,
        ht.team_code as home_team_code,
        at.team_city as away_team_city,
        at.team_name as away_team_name,
        at.team_code as away_team_code,
        pt.team_city as pick_team_city,
        pt.team_name as pick_team_name,
        pt.team_code as pick_team_code
      FROM picks p
      JOIN football_games ng ON p.football_game_id = ng.id
      JOIN football_teams ht ON ng.home_team_id = ht.id
      JOIN football_teams at ON ng.away_team_id = at.id
      JOIN football_teams pt ON p.pick_team_id = pt.id
      WHERE p.user_id = ?
    `;
    
    const params = [targetUserId];
    
    if (gameId) {
      query += ' AND p.game_id = ?';
      params.push(gameId);
    }
    
    if (seasonId) {
      query += ' AND p.season_id = ?';
      params.push(seasonId);
    }
    
    if (week) {
      query += ' AND p.week = ?';
      params.push(parseInt(week));
    }
    
    query += ' ORDER BY ng.week, ng.start_time';

    const picks = await db.all(query, params);

    res.json({ picks });
  } catch (error) {
    console.error('Get picks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Make a pick
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { gameId, footballGameId, pickTeamId, tiebreaker } = req.body;

    if (!gameId || !footballGameId || !pickTeamId) {
      return res.status(400).json({ 
        error: 'Game ID, NFL game ID, and pick team ID are required' 
      });
    }

    // Verify user is participant in the game
    const participant = await db.get(`
      SELECT role FROM game_participants 
      WHERE game_id = ? AND user_id = ?
    `, [gameId, req.user.id]);

    if (!participant) {
      return res.status(403).json({ error: 'You are not a participant in this game' });
    }

    // Get Football game details
    const footballGame = await db.get(`
      SELECT season_id, week, start_time, status
      FROM football_games
      WHERE id = ?
    `, [footballGameId]);

    if (!footballGame) {
      return res.status(404).json({ error: 'Football game not found' });
    }

    // Check if game has already started
    const now = new Date();
    const gameStart = new Date(footballGame.start_time);
    
    if (now >= gameStart) {
      return res.status(400).json({ error: 'Cannot make picks after game has started' });
    }

    // Verify the pick team is playing in this game
    const teamInGame = await db.get(`
      SELECT 1 FROM football_games
      WHERE id = ? AND (home_team_id = ? OR away_team_id = ?)
    `, [footballGameId, pickTeamId, pickTeamId]);

    if (!teamInGame) {
      return res.status(400).json({ error: 'Selected team is not playing in this game' });
    }

    // For survivor games, check if team has been picked before
    const game = await db.get('SELECT game_type FROM pickem_games WHERE id = ?', [gameId]);
    
    if (game.game_type === 'survivor') {
      const previousPick = await db.get(`
        SELECT id FROM picks 
        WHERE user_id = ? AND game_id = ? AND pick_team_id = ? AND season_id = ?
      `, [req.user.id, gameId, pickTeamId, footballGame.season_id]);

      if (previousPick) {
        return res.status(400).json({ 
          error: 'You have already picked this team in survivor mode' 
        });
      }
    }

    // Check if pick already exists for this game
    const existingPick = await db.get(`
      SELECT id FROM picks
      WHERE user_id = ? AND game_id = ? AND football_game_id = ?
    `, [req.user.id, gameId, footballGameId]);

    const pickId = existingPick?.id || uuidv4();

    if (existingPick) {
      // Update existing pick
      await db.run(`
        UPDATE picks 
        SET pick_team_id = ?, tiebreaker = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [pickTeamId, tiebreaker || null, pickId]);
    } else {
      // Create new pick
      await db.run(`
        INSERT INTO picks (
          id, user_id, game_id, season_id, week, football_game_id,
          pick_team_id, tiebreaker
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        pickId,
        req.user.id,
        gameId,
        footballGame.season_id,
        footballGame.week,
        footballGameId,
        pickTeamId,
        tiebreaker || null
      ]);
    }

    // Get the updated/created pick with team info
    const pick = await db.get(`
      SELECT 
        p.*,
        pt.team_city as pick_team_city,
        pt.team_name as pick_team_name,
        pt.team_code as pick_team_code
      FROM picks p
      JOIN football_teams pt ON p.pick_team_id = pt.id
      WHERE p.id = ?
    `, [pickId]);

    res.json({
      message: existingPick ? 'Pick updated successfully' : 'Pick made successfully',
      pick
    });

  } catch (error) {
    console.error('Make pick error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a pick
router.delete('/:pickId', authenticateToken, async (req, res) => {
  try {
    const { pickId } = req.params;

    const pick = await db.get(`
      SELECT p.*, ng.start_time 
      FROM picks p
      JOIN football_games ng ON p.football_game_id = ng.id
      WHERE p.id = ?
    `, [pickId]);

    if (!pick) {
      return res.status(404).json({ error: 'Pick not found' });
    }

    // Only user who made the pick can delete it
    if (pick.user_id !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if game has already started
    const now = new Date();
    const gameStart = new Date(pick.start_time);
    
    if (now >= gameStart) {
      return res.status(400).json({ error: 'Cannot delete picks after game has started' });
    }

    await db.run('DELETE FROM picks WHERE id = ?', [pickId]);

    res.json({ message: 'Pick deleted successfully' });

  } catch (error) {
    console.error('Delete pick error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get game picks summary (for standings)
router.get('/game/:gameId/summary', authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { seasonId, week } = req.query;

    // Verify user has access to this game
    const participant = await db.get(`
      SELECT role FROM game_participants 
      WHERE game_id = ? AND user_id = ?
    `, [gameId, req.user.id]);

    if (!participant && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let query = `
      SELECT 
        u.id as user_id,
        u.first_name,
        u.last_name,
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN p.is_correct = 1 THEN 1 END) as correct_picks,
        ROUND(
          CAST(COUNT(CASE WHEN p.is_correct = 1 THEN 1 END) AS FLOAT) / 
          CAST(COUNT(p.id) AS FLOAT) * 100, 2
        ) as pick_percentage
      FROM game_participants gp
      JOIN users u ON gp.user_id = u.id
      LEFT JOIN picks p ON gp.user_id = p.user_id AND p.game_id = ?
    `;
    
    const params = [gameId, gameId];
    
    if (seasonId) {
      query += ' AND p.season_id = ?';
      params.push(seasonId);
    }
    
    if (week) {
      query += ' AND p.week = ?';
      params.push(parseInt(week));
    }
    
    query += `
      WHERE gp.game_id = ?
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY pick_percentage DESC, correct_picks DESC
    `;

    const summary = await db.all(query, params);

    res.json({ summary });
  } catch (error) {
    console.error('Get picks summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;