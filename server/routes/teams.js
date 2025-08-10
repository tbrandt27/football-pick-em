import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import db from '../models/database.js';

const router = express.Router();

// Get all NFL teams
router.get('/', async (req, res) => {
  try {
    const teams = await db.all(`
      SELECT * FROM nfl_teams 
      ORDER BY team_conference, team_division, team_city
    `);

    res.json({ teams });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get team by ID
router.get('/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const team = await db.get('SELECT * FROM nfl_teams WHERE id = ?', [teamId]);
    
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json({ team });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new team (admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      teamCode,
      teamName,
      teamCity,
      teamConference,
      teamDivision,
      teamLogo,
      teamPrimaryColor,
      teamSecondaryColor
    } = req.body;

    if (!teamCode || !teamName || !teamCity || !teamConference || !teamDivision) {
      return res.status(400).json({ 
        error: 'Team code, name, city, conference, and division are required' 
      });
    }

    // Check if team code already exists
    const existingTeam = await db.get('SELECT id FROM nfl_teams WHERE team_code = ?', [teamCode]);
    if (existingTeam) {
      return res.status(409).json({ error: 'Team with this code already exists' });
    }

    const teamId = uuidv4();
    
    await db.run(`
      INSERT INTO nfl_teams (
        id, team_code, team_name, team_city, team_conference,
        team_division, team_logo, team_primary_color, team_secondary_color
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      teamId,
      teamCode.toUpperCase(),
      teamName,
      teamCity,
      teamConference.toUpperCase(),
      teamDivision,
      teamLogo || null,
      teamPrimaryColor || null,
      teamSecondaryColor || null
    ]);

    const newTeam = await db.get('SELECT * FROM nfl_teams WHERE id = ?', [teamId]);

    res.status(201).json({
      message: 'Team created successfully',
      team: newTeam
    });

  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update team (admin only)
router.put('/:teamId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.params;
    const {
      teamCode,
      teamName,
      teamCity,
      teamConference,
      teamDivision,
      teamLogo,
      teamPrimaryColor,
      teamSecondaryColor
    } = req.body;

    const existingTeam = await db.get('SELECT id FROM nfl_teams WHERE id = ?', [teamId]);
    if (!existingTeam) {
      return res.status(404).json({ error: 'Team not found' });
    }

    await db.run(`
      UPDATE nfl_teams 
      SET team_code = ?, team_name = ?, team_city = ?, team_conference = ?,
          team_division = ?, team_logo = ?, team_primary_color = ?, team_secondary_color = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `, [
      teamCode?.toUpperCase() || existingTeam.team_code,
      teamName || existingTeam.team_name,
      teamCity || existingTeam.team_city,
      teamConference?.toUpperCase() || existingTeam.team_conference,
      teamDivision || existingTeam.team_division,
      teamLogo !== undefined ? teamLogo : existingTeam.team_logo,
      teamPrimaryColor !== undefined ? teamPrimaryColor : existingTeam.team_primary_color,
      teamSecondaryColor !== undefined ? teamSecondaryColor : existingTeam.team_secondary_color,
      teamId
    ]);

    const updatedTeam = await db.get('SELECT * FROM nfl_teams WHERE id = ?', [teamId]);

    res.json({
      message: 'Team updated successfully',
      team: updatedTeam
    });

  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete team (admin only)
router.delete('/:teamId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.params;

    const existingTeam = await db.get('SELECT id FROM nfl_teams WHERE id = ?', [teamId]);
    if (!existingTeam) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check if team is referenced in other tables
    const userCount = await db.get('SELECT COUNT(*) as count FROM users WHERE favorite_team_id = ?', [teamId]);
    const gameCount = await db.get('SELECT COUNT(*) as count FROM nfl_games WHERE home_team_id = ? OR away_team_id = ?', [teamId, teamId]);
    
    if (userCount.count > 0 || gameCount.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete team that is referenced by users or games' 
      });
    }

    await db.run('DELETE FROM nfl_teams WHERE id = ?', [teamId]);

    res.json({ message: 'Team deleted successfully' });

  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get teams by conference
router.get('/conference/:conference', async (req, res) => {
  try {
    const { conference } = req.params;
    
    const teams = await db.all(`
      SELECT * FROM nfl_teams 
      WHERE team_conference = ?
      ORDER BY team_division, team_city
    `, [conference.toUpperCase()]);

    res.json({ teams });
  } catch (error) {
    console.error('Get teams by conference error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get teams by division
router.get('/division/:conference/:division', async (req, res) => {
  try {
    const { conference, division } = req.params;
    
    const teams = await db.all(`
      SELECT * FROM nfl_teams 
      WHERE team_conference = ? AND team_division = ?
      ORDER BY team_city
    `, [conference.toUpperCase(), division]);

    res.json({ teams });
  } catch (error) {
    console.error('Get teams by division error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;