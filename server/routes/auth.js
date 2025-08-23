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

    // Find and validate invitation using the invitation service
    const invitationService = DatabaseServiceFactory.getInvitationService();
    const invitation = await invitationService.getInvitationByToken(inviteToken);
    
    // Validate invitation exists, matches email, and hasn't expired
    if (!invitation ||
        invitation.email !== email.toLowerCase() ||
        invitation.status !== 'pending' ||
        invitation.expires_at <= new Date().toISOString()) {
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
    
    // Determine if this should be an admin user
    const isAdminInvitation = invitation.is_admin_invitation || false;
    
    const createdUser = await userService.createUser({
      id: userId,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      favoriteTeamId,
      emailVerificationToken,
      emailVerified: true,
      isAdmin: isAdminInvitation
    });

    // Only add to game if this is not an admin invitation
    if (!isAdminInvitation && invitation.game_id) {
      const gameService = DatabaseServiceFactory.getGameService();
      await gameService.addParticipant(invitation.game_id, userId, 'player');
    }

    // Mark invitation as accepted
    await invitationService.updateInvitationStatus(invitation.id, 'accepted');

    // Generate JWT token
    const token = jwt.sign(
      { userId: userId, email: email.toLowerCase() },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    let successMessage;
    if (isAdminInvitation) {
      successMessage = 'Admin account created successfully! You now have administrative privileges.';
    } else {
      successMessage = `Account created successfully! You've been added to "${invitation.game_name}".`;
    }

    res.status(201).json({
      message: successMessage,
      token,
      user: {
        id: userId,
        email: email.toLowerCase(),
        firstName,
        lastName,
        favoriteTeamId: favoriteTeamId || null,
        isAdmin: isAdminInvitation,
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