import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import db from '../models/database.js';
import DatabaseServiceFactory from '../services/database/DatabaseServiceFactory.js';

const router = express.Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userService = DatabaseServiceFactory.getUserService();
    const users = await userService.getAllUsers();

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

    const userService = DatabaseServiceFactory.getUserService();
    const user = await userService.getUserById(userId);

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

    const userService = DatabaseServiceFactory.getUserService();
    const updatedUser = await userService.updateUser(userId, {
      firstName,
      lastName,
      favoriteTeamId
    });

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

    const userService = DatabaseServiceFactory.getUserService();
    await userService.updateAdminStatus(userId, isAdmin);

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

    const userService = DatabaseServiceFactory.getUserService();
    const games = await userService.getUserGames(userId);

    res.json({ games });
  } catch (error) {
    console.error('Get user games error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;