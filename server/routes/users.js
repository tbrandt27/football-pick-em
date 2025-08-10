import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import db from '../models/database.js';

const router = express.Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.favorite_team_id,
        u.is_admin,
        u.email_verified,
        u.last_login,
        u.created_at,
        t.team_name as favorite_team_name,
        t.team_city as favorite_team_city
      FROM users u
      LEFT JOIN nfl_teams t ON u.favorite_team_id = t.id
      ORDER BY u.created_at DESC
    `);

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by ID
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Users can only see their own data unless they're admin
    if (userId !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await db.get(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.favorite_team_id,
        u.is_admin,
        u.email_verified,
        u.last_login,
        u.created_at,
        t.team_name as favorite_team_name,
        t.team_city as favorite_team_city
      FROM users u
      LEFT JOIN nfl_teams t ON u.favorite_team_id = t.id
      WHERE u.id = ?
    `, [userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, favoriteTeamId } = req.body;
    
    // Users can only update their own data unless they're admin
    if (userId !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.run(`
      UPDATE users 
      SET first_name = ?, last_name = ?, favorite_team_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [firstName, lastName, favoriteTeamId || null, userId]);

    const updatedUser = await db.get(`
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.favorite_team_id,
        u.is_admin,
        u.email_verified,
        t.team_name as favorite_team_name,
        t.team_city as favorite_team_city
      FROM users u
      LEFT JOIN nfl_teams t ON u.favorite_team_id = t.id
      WHERE u.id = ?
    `, [userId]);

    res.json({ 
      message: 'Profile updated successfully',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user admin status (admin only)
router.put('/:userId/admin', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isAdmin } = req.body;

    await db.run(`
      UPDATE users 
      SET is_admin = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [isAdmin ? 1 : 0, userId]);

    res.json({ message: 'Admin status updated successfully' });
  } catch (error) {
    console.error('Update admin status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's game participation
router.get('/:userId/games', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Users can only see their own games unless they're admin
    if (userId !== req.user.id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const games = await db.all(`
      SELECT 
        g.id,
        g.game_name,
        g.game_type,
        g.created_at,
        gp.role,
        COUNT(CASE WHEN gp2.role = 'player' THEN 1 END) as player_count
      FROM game_participants gp
      JOIN pickem_games g ON gp.game_id = g.id
      LEFT JOIN game_participants gp2 ON g.id = gp2.game_id
      WHERE gp.user_id = ?
      GROUP BY g.id, g.game_name, g.game_type, g.created_at, gp.role
      ORDER BY g.created_at DESC
    `, [userId]);

    res.json({ games });
  } catch (error) {
    console.error('Get user games error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;