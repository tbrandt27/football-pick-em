import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import db from '../models/database.js';

const router = express.Router();

// Get all NFL teams
router.get('/', async (req, res) => {
  try {
    const dbProvider = db.provider; // Use singleton database provider
    const dbType = db.getType();
    
    let teams;
    if (dbType === 'dynamodb') {
      const result = await dbProvider._dynamoScan('football_teams');
      teams = result.Items || [];
      
      // Sort manually since DynamoDB doesn't support ORDER BY
      teams.sort((a, b) => {
        if (a.team_conference !== b.team_conference) {
          return a.team_conference.localeCompare(b.team_conference);
        }
        if (a.team_division !== b.team_division) {
          return a.team_division.localeCompare(b.team_division);
        }
        return a.team_city.localeCompare(b.team_city);
      });
    } else {
      teams = await dbProvider.all(`
        SELECT * FROM football_teams
        ORDER BY team_conference, team_division, team_city
      `);
    }

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
    
    const dbProvider = db.provider; // Use singleton database provider
    const dbType = db.getType();
    
    let team;
    if (dbType === 'dynamodb') {
      const result = await dbProvider._dynamoGet('football_teams', { id: teamId });
      team = result.Item;
    } else {
      team = await dbProvider.get('SELECT * FROM football_teams WHERE id = ?', [teamId]);
    }
    
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

    const dbProvider = db.provider; // Use singleton database provider
    const dbType = db.getType();

    // Check if team code already exists
    let existingTeam;
    if (dbType === 'dynamodb') {
      const result = await dbProvider._dynamoScan('football_teams', { team_code: teamCode.toUpperCase() });
      existingTeam = result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } else {
      existingTeam = await dbProvider.get('SELECT id FROM football_teams WHERE team_code = ?', [teamCode]);
    }
    
    if (existingTeam) {
      return res.status(409).json({ error: 'Team with this code already exists' });
    }

    const teamId = uuidv4();
    const teamData = {
      id: teamId,
      team_code: teamCode.toUpperCase(),
      team_name: teamName,
      team_city: teamCity,
      team_conference: teamConference.toUpperCase(),
      team_division: teamDivision,
      team_logo: teamLogo || null,
      team_primary_color: teamPrimaryColor || null,
      team_secondary_color: teamSecondaryColor || null
    };
    
    if (dbType === 'dynamodb') {
      await dbProvider._dynamoPut('football_teams', teamData);
    } else {
      await dbProvider.run(`
        INSERT INTO football_teams (
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
    }

    const newTeam = dbType === 'dynamodb' ? teamData : await dbProvider.get('SELECT * FROM football_teams WHERE id = ?', [teamId]);

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

    const dbProvider = db.provider; // Use singleton database provider
    const dbType = db.getType();

    let existingTeam;
    if (dbType === 'dynamodb') {
      const result = await dbProvider._dynamoGet('football_teams', { id: teamId });
      existingTeam = result.Item;
    } else {
      existingTeam = await dbProvider.get('SELECT * FROM football_teams WHERE id = ?', [teamId]);
    }
    
    if (!existingTeam) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const updateData = {
      team_code: teamCode?.toUpperCase() || existingTeam.team_code,
      team_name: teamName || existingTeam.team_name,
      team_city: teamCity || existingTeam.team_city,
      team_conference: teamConference?.toUpperCase() || existingTeam.team_conference,
      team_division: teamDivision || existingTeam.team_division,
      team_logo: teamLogo !== undefined ? teamLogo : existingTeam.team_logo,
      team_primary_color: teamPrimaryColor !== undefined ? teamPrimaryColor : existingTeam.team_primary_color,
      team_secondary_color: teamSecondaryColor !== undefined ? teamSecondaryColor : existingTeam.team_secondary_color
    };

    if (dbType === 'dynamodb') {
      updateData.updated_at = new Date().toISOString();
      await dbProvider._dynamoUpdate('football_teams', { id: teamId }, updateData);
    } else {
      await dbProvider.run(`
        UPDATE football_teams
        SET team_code = ?, team_name = ?, team_city = ?, team_conference = ?,
            team_division = ?, team_logo = ?, team_primary_color = ?, team_secondary_color = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `, [
        updateData.team_code,
        updateData.team_name,
        updateData.team_city,
        updateData.team_conference,
        updateData.team_division,
        updateData.team_logo,
        updateData.team_primary_color,
        updateData.team_secondary_color,
        teamId
      ]);
    }

    const updatedTeam = dbType === 'dynamodb' ? { ...existingTeam, ...updateData } : await dbProvider.get('SELECT * FROM football_teams WHERE id = ?', [teamId]);

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

    const dbProvider = db.provider; // Use singleton database provider
    const dbType = db.getType();

    let existingTeam;
    if (dbType === 'dynamodb') {
      const result = await dbProvider._dynamoGet('football_teams', { id: teamId });
      existingTeam = result.Item;
    } else {
      existingTeam = await dbProvider.get('SELECT id FROM football_teams WHERE id = ?', [teamId]);
    }
    
    if (!existingTeam) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Check if team is referenced in other tables
    let userCount = 0;
    let gameCount = 0;
    
    if (dbType === 'dynamodb') {
      const usersResult = await dbProvider._dynamoScan('users', { favorite_team_id: teamId });
      userCount = usersResult.Items ? usersResult.Items.length : 0;
      
      const homeGamesResult = await dbProvider._dynamoScan('football_games', { home_team_id: teamId });
      const awayGamesResult = await dbProvider._dynamoScan('football_games', { away_team_id: teamId });
      gameCount = (homeGamesResult.Items ? homeGamesResult.Items.length : 0) +
                  (awayGamesResult.Items ? awayGamesResult.Items.length : 0);
    } else {
      const userResult = await dbProvider.get('SELECT COUNT(*) as count FROM users WHERE favorite_team_id = ?', [teamId]);
      const gameResult = await dbProvider.get('SELECT COUNT(*) as count FROM football_games WHERE home_team_id = ? OR away_team_id = ?', [teamId, teamId]);
      userCount = userResult.count;
      gameCount = gameResult.count;
    }
    
    if (userCount > 0 || gameCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete team that is referenced by users or games'
      });
    }

    if (dbType === 'dynamodb') {
      await dbProvider._dynamoDelete('football_teams', { id: teamId });
    } else {
      await dbProvider.run('DELETE FROM football_teams WHERE id = ?', [teamId]);
    }

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
    
    const dbProvider = db.provider; // Use singleton database provider
    const dbType = db.getType();
    
    let teams;
    if (dbType === 'dynamodb') {
      const result = await dbProvider._dynamoScan('football_teams', { team_conference: conference.toUpperCase() });
      teams = result.Items || [];
      
      // Sort manually since DynamoDB doesn't support ORDER BY
      teams.sort((a, b) => {
        if (a.team_division !== b.team_division) {
          return a.team_division.localeCompare(b.team_division);
        }
        return a.team_city.localeCompare(b.team_city);
      });
    } else {
      teams = await dbProvider.all(`
        SELECT * FROM football_teams
        WHERE team_conference = ?
        ORDER BY team_division, team_city
      `, [conference.toUpperCase()]);
    }

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
    
    const dbProvider = db.provider; // Use singleton database provider
    const dbType = db.getType();
    
    let teams;
    if (dbType === 'dynamodb') {
      const result = await dbProvider._dynamoScan('football_teams', {
        team_conference: conference.toUpperCase(),
        team_division: division
      });
      teams = result.Items || [];
      
      // Sort manually since DynamoDB doesn't support ORDER BY
      teams.sort((a, b) => a.team_city.localeCompare(b.team_city));
    } else {
      teams = await dbProvider.all(`
        SELECT * FROM football_teams
        WHERE team_conference = ? AND team_division = ?
        ORDER BY team_city
      `, [conference.toUpperCase(), division]);
    }

    res.json({ teams });
  } catch (error) {
    console.error('Get teams by division error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;