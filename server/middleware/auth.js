import jwt from 'jsonwebtoken';
import db from '../models/database.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
    const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireAdmin = async (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const requireGameOwner = async (req, res, next) => {
  const gameId = req.params.gameId || req.body.gameId;
  
  if (!gameId) {
    return res.status(400).json({ error: 'Game ID required' });
  }

  try {
    const participant = await db.get(`
      SELECT role FROM game_participants 
      WHERE game_id = ? AND user_id = ? AND role = 'owner'
    `, [gameId, req.user.id]);

    if (!participant && !req.user.is_admin) {
      return res.status(403).json({ error: 'Game owner access required' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
};