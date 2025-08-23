import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth.js';
import DatabaseServiceFactory from '../services/database/DatabaseServiceFactory.js';
import db from '../models/database.js';

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
    const userService = DatabaseServiceFactory.getUserService();
    const userExists = await userService.userExists(email);
    if (userExists) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const userId = uuidv4();
    const emailVerificationToken = uuidv4();
    
    const createdUser = await userService.createUser({
      id: userId,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      favoriteTeamId,
      emailVerificationToken,
      emailVerified: false
    });

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
    // TODO: This should be moved to a proper service when invitation service is implemented
    // For now, we need to handle both database types
    let invitation = null;
    
    const dbProvider = db.provider; // Use singleton database provider
    const dbType = db.getType();
    
    if (dbType === 'dynamodb') {
      // For DynamoDB, scan invitations and get game info separately
      const invitationsResult = await dbProvider._dynamoScan('game_invitations', {
        invite_token: inviteToken,
        email: email.toLowerCase(),
        status: 'pending'
      });
      
      if (invitationsResult.Items && invitationsResult.Items.length > 0) {
        const foundInvitation = invitationsResult.Items[0];
        
        // Check if invitation hasn't expired
        const now = new Date();
        const expiresAt = new Date(foundInvitation.expires_at);
        
        if (expiresAt > now) {
          // Get game name
          const gameResult = await dbProvider._dynamoGet('pickem_games', { id: foundInvitation.game_id });
          invitation = {
            ...foundInvitation,
            game_name: gameResult.Item ? gameResult.Item.game_name : 'Unknown Game'
          };
        }
      }
    } else {
      // For SQLite, use the existing JOIN query
      const dbInstance = db.provider; // Use singleton database provider
      invitation = await dbInstance.get(`
        SELECT gi.*, pg.game_name
        FROM game_invitations gi
        JOIN pickem_games pg ON gi.game_id = pg.id
        WHERE gi.invite_token = ? AND gi.email = ? AND gi.status = 'pending' AND gi.expires_at > datetime('now')
      `, [inviteToken, email.toLowerCase()]);
    }

    if (!invitation) {
      return res.status(400).json({ error: 'Invalid or expired invitation token' });
    }

    // Check if user already exists
    const userService = DatabaseServiceFactory.getUserService();
    const userExists = await userService.userExists(email);
    if (userExists) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const userId = uuidv4();
    const emailVerificationToken = uuidv4();
    
    const createdUser = await userService.createUser({
      id: userId,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      favoriteTeamId,
      emailVerificationToken,
      emailVerified: true
    });

    // Add user to the game using the game service
    const gameService = DatabaseServiceFactory.getGameService();
    await gameService.addParticipant(invitation.game_id, userId, 'player');

    // Mark invitation as accepted
    // TODO: This should be moved to a proper invitation service
    if (dbType === 'dynamodb') {
      await dbProvider._dynamoUpdate('game_invitations', { id: invitation.id }, {
        status: 'accepted',
        updated_at: new Date().toISOString()
      });
    } else {
      const dbInstance = db.provider; // Use singleton database provider
      await dbInstance.run(`
        UPDATE game_invitations
        SET status = 'accepted', updated_at = datetime('now')
        WHERE id = ?
      `, [invitation.id]);
    }

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
    const userService = DatabaseServiceFactory.getUserService();
    const user = await userService.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await userService.updateLastLogin(user.id);

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

    const userService = DatabaseServiceFactory.getUserService();
    const updatedUser = await userService.updateUserDynamic(userId, { firstName, lastName, favoriteTeamId });

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

    const userService = DatabaseServiceFactory.getUserService();
    const user = await userService.getUserByEmail(email);
    if (!user) {
      // Don't reveal whether user exists
      return res.json({ message: 'If an account exists, a reset email has been sent' });
    }

    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

    await userService.setPasswordResetToken(user.id, resetToken, resetExpires);

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

    const userService = DatabaseServiceFactory.getUserService();
    const user = await userService.getUserByResetToken(token);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await userService.resetPassword(user.id, hashedPassword);

    res.json({ message: 'Password reset successful' });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;