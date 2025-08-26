import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import DatabaseServiceFactory from '../services/database/DatabaseServiceFactory.js';
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

    // Use the picks service
    const pickService = DatabaseServiceFactory.getPickService();
    const picks = await pickService.getUserPicks({
      userId: targetUserId,
      gameId,
      seasonId,
      week
    });

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

    // Get football game details using NFL Data Service
    const nflDataService = DatabaseServiceFactory.getNFLDataService();
    const footballGame = await nflDataService.getFootballGameById(footballGameId);

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

    // Get game details for survivor check
    const game = await gameService.getGameById(gameId, req.user.id);
    
    if (game && (game.type === 'survivor' || game.game_type === 'survivor')) {
      // Check if user has already picked this team in survivor mode
      const pickService = DatabaseServiceFactory.getPickService();
      const hasPickedTeam = await pickService.hasPickedTeamInSurvivor(
        req.user.id,
        gameId,
        pickTeamId,
        footballGame.season_id
      );

      if (hasPickedTeam) {
        return res.status(400).json({
          error: 'You have already picked this team in survivor mode'
        });
      }
    }

    // Create or update the pick using the service
    const pickService = DatabaseServiceFactory.getPickService();
    
    // For survivor games, check for existing pick by week (not by footballGameId)
    // For weekly games, check by footballGameId as normal
    let existingPick;
    if (game && (game.type === 'survivor' || game.game_type === 'survivor')) {
      // For survivor games, replace any existing pick for this week
      const userWeekPicks = await pickService.getUserPicks({
        userId: req.user.id,
        gameId,
        seasonId: footballGame.season_id,
        week: footballGame.week
      });
      existingPick = userWeekPicks.length > 0 ? userWeekPicks[0] : null;
      
      // If there's an existing pick for this week but different football game, delete it first
      if (existingPick && existingPick.football_game_id !== footballGameId) {
        await pickService.deletePick(existingPick.id, req.user.id);
        existingPick = null; // Force creation of new pick
      }
    } else {
      // For weekly games, check by specific football game
      existingPick = await pickService.getExistingPick(req.user.id, gameId, footballGameId);
    }
    
    const wasUpdate = !!existingPick;
    
    const pick = await pickService.createOrUpdatePick({
      userId: req.user.id,
      gameId,
      footballGameId,
      pickTeamId,
      tiebreaker
    });

    res.json({
      message: wasUpdate ? 'Pick updated successfully' : 'Pick made successfully',
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

    // Use the pick service
    const pickService = DatabaseServiceFactory.getPickService();
    const pick = await pickService.getPickById(pickId);

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

    await pickService.deletePick(pickId, req.user.id);

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

    // Use the pick service to get the summary
    const pickService = DatabaseServiceFactory.getPickService();
    const summary = await pickService.getGamePicksSummary(gameId, {
      seasonId,
      week: week ? parseInt(week) : undefined
    });

    res.json({ summary });
  } catch (error) {
    console.error('Get picks summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get team pick percentages for survivor games
router.get('/game/:gameId/survivor-stats/:week', authenticateToken, async (req, res) => {
  try {
    const { gameId, week } = req.params;
    const { seasonId } = req.query;

    if (!seasonId) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    // Verify user has access to this game
    const gameService = DatabaseServiceFactory.getGameService();
    const participant = await gameService.getParticipant(gameId, req.user.id);

    if (!participant && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all picks for this game, season, and week from all users
    const pickService = DatabaseServiceFactory.getPickService();
    
    // First get all participants in the game
    const participants = await gameService.getGameParticipants(gameId);
    
    // Get picks for each participant
    let allPicks = [];
    for (const participant of participants) {
      const userPicks = await pickService.getUserPicks({
        userId: participant.user_id,
        gameId,
        seasonId,
        week: parseInt(week)
      });
      allPicks = allPicks.concat(userPicks);
    }

    // Count picks by team
    const teamPickCounts = {};
    let totalPicks = 0;

    allPicks.forEach(pick => {
      if (!teamPickCounts[pick.pick_team_id]) {
        teamPickCounts[pick.pick_team_id] = 0;
      }
      teamPickCounts[pick.pick_team_id]++;
      totalPicks++;
    });

    // Calculate percentages
    const teamStats = Object.entries(teamPickCounts).map(([teamId, count]) => ({
      teamId,
      pickCount: count,
      percentage: totalPicks > 0 ? (count / totalPicks) * 100 : 0
    }));

    res.json({
      teamStats,
      totalPicks,
      week: parseInt(week)
    });
  } catch (error) {
    console.error('Get survivor stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;