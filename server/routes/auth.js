import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../models/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, favoriteTeamId } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        error: 'Email, password, first name, and last name are required' 
      });
    }

    // Check if user already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const userId = uuidv4();
    const emailVerificationToken = uuidv4();
    
    await db.run(`
      INSERT INTO users (
        id, email, password, first_name, last_name, favorite_team_id,
        email_verification_token, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      userId,
      email.toLowerCase(),
      hashedPassword,
      firstName,
      lastName,
      favoriteTeamId || null,
      emailVerificationToken
    ]);

    // Generate JWT token
    const token = jwt.sign(
      { userId, email: email.toLowerCase() },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: userId,
        email: email.toLowerCase(),
        firstName,
        lastName,
        favoriteTeamId,
        isAdmin: false,
        emailVerified: false
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register user with invitation token
router.post('/register-invite', async (req, res) => {
  try {
    const { email, password, firstName, lastName, favoriteTeamId, inviteToken } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !inviteToken) {
      return res.status(400).json({ 
        error: 'Email, password, first name, last name, and invite token are required' 
      });
    }

    // Find and validate invitation
    const invitation = await db.get(`
      SELECT gi.*, pg.game_name 
      FROM game_invitations gi
      JOIN pickem_games pg ON gi.game_id = pg.id
      WHERE gi.invite_token = ? AND gi.email = ? AND gi.status = 'pending' AND gi.expires_at > datetime('now')
    `, [inviteToken, email.toLowerCase()]);

    if (!invitation) {
      return res.status(400).json({ error: 'Invalid or expired invitation token' });
    }

    // Check if user already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const userId = uuidv4();
    const emailVerificationToken = uuidv4();
    
    await db.run(`
      INSERT INTO users (
        id, email, password, first_name, last_name, favorite_team_id,
        email_verification_token, email_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `, [
      userId,
      email.toLowerCase(),
      hashedPassword,
      firstName,
      lastName,
      favoriteTeamId || null,
      emailVerificationToken
    ]);

    // Add user to the game
    await db.run(`
      INSERT INTO game_participants (id, game_id, user_id, role)
      VALUES (?, ?, ?, 'player')
    `, [uuidv4(), invitation.game_id, userId]);

    // Mark invitation as accepted
    await db.run(`
      UPDATE game_invitations 
      SET status = 'accepted', updated_at = datetime('now')
      WHERE id = ?
    `, [invitation.id]);

    // Generate JWT token
    const token = jwt.sign(
      { userId: userId, email: email.toLowerCase() },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: `Account created successfully! You've been added to "${invitation.game_name}".`,
      token,
      user: {
        id: userId,
        email: email.toLowerCase(),
        firstName,
        lastName,
        favoriteTeamId: favoriteTeamId || null,
        isAdmin: false,
        emailVerified: true
      }
    });

  } catch (error) {
    console.error('Invite registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await db.run('UPDATE users SET last_login = datetime(\"now\") WHERE id = ?', [user.id]);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        favoriteTeamId: user.favorite_team_id,
        isAdmin: Boolean(user.is_admin),
        emailVerified: Boolean(user.email_verified)
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        favoriteTeamId: user.favorite_team_id,
        isAdmin: Boolean(user.is_admin),
        emailVerified: Boolean(user.email_verified)
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/update', authenticateToken, async (req, res) => {
  try {
    const { favoriteTeamId, firstName, lastName } = req.body;
    const userId = req.user.id;

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];

    if (firstName !== undefined) {
      updates.push('first_name = ?');
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push('last_name = ?');
      values.push(lastName);
    }
    if (favoriteTeamId !== undefined) {
      updates.push('favorite_team_id = ?');
      values.push(favoriteTeamId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Add updated_at timestamp and user ID
    updates.push('updated_at = datetime("now")');
    values.push(userId);

    await db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Fetch updated user
    const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

    res.json({
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        favoriteTeamId: updatedUser.favorite_team_id,
        isAdmin: Boolean(updatedUser.is_admin),
        emailVerified: Boolean(updatedUser.email_verified)
      }
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      // Don't reveal whether user exists
      return res.json({ message: 'If an account exists, a reset email has been sent' });
    }

    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

    await db.run(`
      UPDATE users 
      SET password_reset_token = ?, password_reset_expires = ?
      WHERE id = ?
    `, [resetToken, resetExpires.toISOString(), user.id]);

    // TODO: Send reset email
    console.log(`Password reset requested for ${email}. Reset token: ${resetToken}`);

    res.json({ message: 'If an account exists, a reset email has been sent' });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const user = await db.get(`
      SELECT id FROM users 
      WHERE password_reset_token = ? AND password_reset_expires > datetime('now')
    `, [token]);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await db.run(`
      UPDATE users 
      SET password = ?, password_reset_token = NULL, password_reset_expires = NULL
      WHERE id = ?
    `, [hashedPassword, user.id]);

    res.json({ message: 'Password reset successful' });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;