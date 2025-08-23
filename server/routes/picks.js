import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import DatabaseServiceFactory from '../services/database/DatabaseServiceFactory.js';

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
        const gameService = DatabaseServiceFactory.getGameService();
        const userParticipant = await gameService.getParticipant(gameId, req.user.id);
        const targetParticipant = await gameService.getParticipant(gameId, targetUserId);
        
        if (!userParticipant || !targetParticipant) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // TODO: This should be moved to a PickService when it's implemented
    // For now, handle both database types
    const dbProvider = DatabaseProviderFactory.createProvider();
    const dbType = DatabaseProviderFactory.getProviderType();
    
    let picks = [];
    
    if (dbType === 'dynamodb') {
      // For DynamoDB, we need to handle this differently since JOINs aren't supported
      // Get picks first, then enrich with related data
      let pickConditions = { user_id: targetUserId };
      if (gameId) pickConditions.game_id = gameId;
      if (seasonId) pickConditions.season_id = seasonId;
      if (week) pickConditions.week = parseInt(week);
      
      const picksResult = await dbProvider._dynamoScan('picks', pickConditions);
      const rawPicks = picksResult.Items || [];
      
      // Enrich picks with game and team data
      for (const pick of rawPicks) {
        try {
          // Get football game
          const gameResult = await dbProvider._dynamoGet('football_games', { id: pick.football_game_id });
          const footballGame = gameResult.Item;
          
          if (footballGame) {
            // Get teams
            const homeTeamResult = await dbProvider._dynamoGet('football_teams', { id: footballGame.home_team_id });
            const awayTeamResult = await dbProvider._dynamoGet('football_teams', { id: footballGame.away_team_id });
            const pickTeamResult = await dbProvider._dynamoGet('football_teams', { id: pick.pick_team_id });
            
            const homeTeam = homeTeamResult.Item || {};
            const awayTeam = awayTeamResult.Item || {};
            const pickTeam = pickTeamResult.Item || {};
            
            picks.push({
              ...pick,
              week: footballGame.week,
              start_time: footballGame.start_time,
              game_status: footballGame.status,
              home_team_city: homeTeam.team_city,
              home_team_name: homeTeam.team_name,
              home_team_code: homeTeam.team_code,
              away_team_city: awayTeam.team_city,
              away_team_name: awayTeam.team_name,
              away_team_code: awayTeam.team_code,
              pick_team_city: pickTeam.team_city,
              pick_team_name: pickTeam.team_name,
              pick_team_code: pickTeam.team_code
            });
          }
        } catch (error) {
          console.warn('Error enriching pick data:', error);
        }
      }
      
      // Sort by week and start_time
      picks.sort((a, b) => {
        if (a.week !== b.week) return a.week - b.week;
        return new Date(a.start_time) - new Date(b.start_time);
      });
    } else {
      // For SQLite, use the existing JOIN query
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

      picks = await dbProvider.all(query, params);
    }

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
    const gameService = DatabaseServiceFactory.getGameService();
    const participant = await gameService.getParticipant(gameId, req.user.id);

    if (!participant) {
      return res.status(403).json({ error: 'You are not a participant in this game' });
    }

    // Get Football game details
    const dbProvider = DatabaseProviderFactory.createProvider();
    const dbType = DatabaseProviderFactory.getProviderType();
    
    let footballGame;
    if (dbType === 'dynamodb') {
      const gameResult = await dbProvider._dynamoGet('football_games', { id: footballGameId });
      footballGame = gameResult.Item;
    } else {
      footballGame = await dbProvider.get(`
        SELECT season_id, week, start_time, status
        FROM football_games
        WHERE id = ?
      `, [footballGameId]);
    }

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
    const teamInGame = footballGame.home_team_id === pickTeamId || footballGame.away_team_id === pickTeamId;

    if (!teamInGame) {
      return res.status(400).json({ error: 'Selected team is not playing in this game' });
    }

    // For survivor games, check if team has been picked before
    let game;
    if (dbType === 'dynamodb') {
      const gameResult = await dbProvider._dynamoGet('pickem_games', { id: gameId });
      game = gameResult.Item;
    } else {
      game = await dbProvider.get('SELECT type FROM pickem_games WHERE id = ?', [gameId]);
    }
    
    if (game && (game.type === 'survivor' || game.game_type === 'survivor')) {
      // Check if user has already picked this team in survivor mode
      let previousPick;
      if (dbType === 'dynamodb') {
        const picksResult = await dbProvider._dynamoScan('picks', {
          user_id: req.user.id,
          game_id: gameId,
          pick_team_id: pickTeamId,
          season_id: footballGame.season_id
        });
        previousPick = picksResult.Items && picksResult.Items.length > 0 ? picksResult.Items[0] : null;
      } else {
        previousPick = await dbProvider.get(`
          SELECT id FROM picks
          WHERE user_id = ? AND game_id = ? AND pick_team_id = ? AND season_id = ?
        `, [req.user.id, gameId, pickTeamId, footballGame.season_id]);
      }

      if (previousPick) {
        return res.status(400).json({
          error: 'You have already picked this team in survivor mode'
        });
      }
    }

    // Check if pick already exists for this game
    let existingPick;
    if (dbType === 'dynamodb') {
      const picksResult = await dbProvider._dynamoScan('picks', {
        user_id: req.user.id,
        game_id: gameId,
        football_game_id: footballGameId
      });
      existingPick = picksResult.Items && picksResult.Items.length > 0 ? picksResult.Items[0] : null;
    } else {
      existingPick = await dbProvider.get(`
        SELECT id FROM picks
        WHERE user_id = ? AND game_id = ? AND football_game_id = ?
      `, [req.user.id, gameId, footballGameId]);
    }

    const pickId = existingPick?.id || uuidv4();

    if (existingPick) {
      // Update existing pick
      if (dbType === 'dynamodb') {
        await dbProvider._dynamoUpdate('picks', { id: pickId }, {
          pick_team_id: pickTeamId,
          tiebreaker: tiebreaker || null,
          updated_at: new Date().toISOString()
        });
      } else {
        await dbProvider.run(`
          UPDATE picks
          SET pick_team_id = ?, tiebreaker = ?, updated_at = datetime('now')
          WHERE id = ?
        `, [pickTeamId, tiebreaker || null, pickId]);
      }
    } else {
      // Create new pick
      const pickData = {
        id: pickId,
        user_id: req.user.id,
        game_id: gameId,
        season_id: footballGame.season_id,
        week: footballGame.week,
        football_game_id: footballGameId,
        pick_team_id: pickTeamId,
        tiebreaker: tiebreaker || null
      };
      
      if (dbType === 'dynamodb') {
        await dbProvider._dynamoPut('picks', pickData);
      } else {
        await dbProvider.run(`
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
    }

    // Get the updated/created pick with team info
    let pick;
    if (dbType === 'dynamodb') {
      const pickResult = await dbProvider._dynamoGet('picks', { id: pickId });
      const pickData = pickResult.Item;
      
      if (pickData) {
        const teamResult = await dbProvider._dynamoGet('football_teams', { id: pickData.pick_team_id });
        const team = teamResult.Item || {};
        
        pick = {
          ...pickData,
          pick_team_city: team.team_city,
          pick_team_name: team.team_name,
          pick_team_code: team.team_code
        };
      }
    } else {
      pick = await dbProvider.get(`
        SELECT
          p.*,
          pt.team_city as pick_team_city,
          pt.team_name as pick_team_name,
          pt.team_code as pick_team_code
        FROM picks p
        JOIN football_teams pt ON p.pick_team_id = pt.id
        WHERE p.id = ?
      `, [pickId]);
    }

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

    const dbProvider = DatabaseProviderFactory.createProvider();
    const dbType = DatabaseProviderFactory.getProviderType();

    let pick;
    if (dbType === 'dynamodb') {
      const pickResult = await dbProvider._dynamoGet('picks', { id: pickId });
      const pickData = pickResult.Item;
      
      if (pickData) {
        // Get football game details for start time
        const gameResult = await dbProvider._dynamoGet('football_games', { id: pickData.football_game_id });
        const footballGame = gameResult.Item;
        
        pick = {
          ...pickData,
          start_time: footballGame ? footballGame.start_time : null
        };
      }
    } else {
      pick = await dbProvider.get(`
        SELECT p.*, ng.start_time
        FROM picks p
        JOIN football_games ng ON p.football_game_id = ng.id
        WHERE p.id = ?
      `, [pickId]);
    }

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

    if (dbType === 'dynamodb') {
      await dbProvider._dynamoDelete('picks', { id: pickId });
    } else {
      await dbProvider.run('DELETE FROM picks WHERE id = ?', [pickId]);
    }

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
    const gameService = DatabaseServiceFactory.getGameService();
    const participant = await gameService.getParticipant(gameId, req.user.id);

    if (!participant && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get participants and calculate summary
    const participants = await gameService.getGameParticipants(gameId);
    const userService = DatabaseServiceFactory.getUserService();
    const dbProvider = DatabaseProviderFactory.createProvider();
    const dbType = DatabaseProviderFactory.getProviderType();
    
    const summary = await Promise.all(participants.map(async (participant) => {
      try {
        // Get picks for this user/game
        let picks = [];
        
        if (dbType === 'dynamodb') {
          let pickConditions = {
            user_id: participant.user_id,
            game_id: gameId
          };
          if (seasonId) pickConditions.season_id = seasonId;
          if (week) pickConditions.week = parseInt(week);
          
          const picksResult = await dbProvider._dynamoScan('picks', pickConditions);
          picks = picksResult.Items || [];
        } else {
          let picksQuery = 'SELECT * FROM picks WHERE user_id = ? AND game_id = ?';
          let picksParams = [participant.user_id, gameId];
          
          if (seasonId) {
            picksQuery += ' AND season_id = ?';
            picksParams.push(seasonId);
          }
          
          if (week) {
            picksQuery += ' AND week = ?';
            picksParams.push(parseInt(week));
          }
          
          picks = await dbProvider.all(picksQuery, picksParams);
        }
        
        const totalPicks = picks.length;
        const correctPicks = picks.filter(p => p.is_correct === true || p.is_correct === 1).length;
        const pickPercentage = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 100 * 100) / 100 : 0;
        
        return {
          user_id: participant.user_id,
          first_name: participant.first_name,
          last_name: participant.last_name,
          total_picks: totalPicks,
          correct_picks: correctPicks,
          pick_percentage: pickPercentage
        };
      } catch (error) {
        console.warn('Error calculating picks for user:', participant.user_id, error);
        return null;
      }
    }));
    
    // Filter out nulls and sort
    const filteredSummary = summary.filter(s => s !== null)
      .sort((a, b) => {
        if (b.pick_percentage !== a.pick_percentage) {
          return b.pick_percentage - a.pick_percentage;
        }
        return b.correct_picks - a.correct_picks;
      });

    res.json({ summary: filteredSummary });
  } catch (error) {
    console.error('Get picks summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;