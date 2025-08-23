import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import DatabaseServiceFactory from '../services/database/DatabaseServiceFactory.js';
import espnService from '../services/espnApi.js';

const router = express.Router();

// Get all seasons
router.get('/', async (req, res) => {
  try {
    const seasonService = DatabaseServiceFactory.getSeasonService();
    const seasons = await seasonService.getAllSeasons();

    res.json({ seasons });
  } catch (error) {
    console.error('Get seasons error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current season
router.get('/current', async (req, res) => {
  try {
    const seasonService = DatabaseServiceFactory.getSeasonService();
    const currentSeason = await seasonService.getCurrentSeason();

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
    const seasonService = DatabaseServiceFactory.getSeasonService();
    const season = await seasonService.getSeasonById(seasonId);
    
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

    const seasonService = DatabaseServiceFactory.getSeasonService();
    const newSeason = await seasonService.createSeason({ season, isCurrent });

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

    const seasonService = DatabaseServiceFactory.getSeasonService();
    const updatedSeason = await seasonService.updateSeason(seasonId, { season, isCurrent });

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

    const seasonService = DatabaseServiceFactory.getSeasonService();
    await seasonService.setCurrentSeason(seasonId);

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

    const seasonService = DatabaseServiceFactory.getSeasonService();
    await seasonService.deleteSeason(seasonId);

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

    const seasonService = DatabaseServiceFactory.getSeasonService();
    const filters = {};
    if (week) {
      filters.week = parseInt(week);
    }

    const games = await seasonService.getSeasonGames(seasonId, filters);
    res.json({ games });
  } catch (error) {
    console.error('Get season games error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;