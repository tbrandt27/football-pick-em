import express from "express";
import { v4 as uuidv4 } from "uuid";
import { authenticateToken, requireGameOwner } from "../middleware/auth.js";
import emailService from "../services/emailService.js";
import crypto from "crypto";
import DatabaseServiceFactory from "../services/database/DatabaseServiceFactory.js";
import db from "../models/database.js";

// Utility function to create URL-friendly slugs
function createGameSlug(gameName) {
  return gameName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters except spaces and hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .trim()
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

const router = express.Router();

// Get all pickem games (users see only games they participate in)
router.get("/", authenticateToken, async (req, res) => {
  try {
    const gameService = DatabaseServiceFactory.getGameService();
    const games = await gameService.getUserGames(req.user.id);

    res.json({ games });
  } catch (error) {
    console.error("Get games error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get game by slug (participants can view)
router.get("/by-slug/:gameSlug", authenticateToken, async (req, res) => {
  try {
    const { gameSlug } = req.params;
    const userId = req.user.id;
    const decodedSlug = decodeURIComponent(gameSlug);

    const gameService = DatabaseServiceFactory.getGameService();
    const game = await gameService.getGameBySlug(decodedSlug, userId);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    res.json({
      game: game,
    });
  } catch (error) {
    console.error("Get game by slug error:", error);
    if (error.message === 'Access denied') {
      res.status(403).json({ error: "Access denied" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Get specific game
router.get("/:gameId", authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params;

    const gameService = DatabaseServiceFactory.getGameService();
    const game = await gameService.getGameById(gameId, req.user.id);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    res.json({
      game: game,
    });
  } catch (error) {
    console.error("Get game error:", error);
    if (error.message === 'Access denied') {
      res.status(403).json({ error: "Access denied" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Create new pickem game
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { gameName, gameType = "week" } = req.body;

    if (!gameName) {
      return res.status(400).json({ error: "Game name is required" });
    }

    if (!["week", "survivor"].includes(gameType)) {
      return res
        .status(400)
        .json({ error: 'Game type must be "week" or "survivor"' });
    }

    const gameId = uuidv4();

    // Get current season using the service layer
    const seasonService = DatabaseServiceFactory.getSeasonService();
    const currentSeason = await seasonService.getCurrentSeason();
    
    if (!currentSeason) {
      console.error(`[Game Creation] No current season found - returning error to client`);
      return res.status(400).json({
        error: "No current season set. Please contact an administrator.",
      });
    }
    
    console.log(`[Game Creation] Using current season:`, {
      id: currentSeason.id,
      year: currentSeason.year,
      is_current: currentSeason.is_current
    });

    // Convert gameType to match database values
    const dbGameType = gameType === "week" ? "weekly" : "survivor";

    // Create the game (note: using game_name column, not name) - set as active by default
    console.log(`[Game Creation] Creating game with data:`, {
      gameId,
      gameName,
      dbGameType,
      commissionerId: req.user.id,
      seasonId: currentSeason.id,
      databaseType: db.getType()
    });
    
    // Create the game using the service layer
    const gameService = DatabaseServiceFactory.getGameService();
    const newGame = await gameService.createGame({
      gameName,
      gameType,
      commissionerId: req.user.id,
      seasonId: currentSeason.id
    });

    res.status(201).json({
      message: "Game created successfully",
      game: newGame,
    });
  } catch (error) {
    console.error("Create game error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update game (owner only)
router.put(
  "/:gameId",
  authenticateToken,
  requireGameOwner,
  async (req, res) => {
    try {
      const { gameId } = req.params;
      const { gameName, gameType } = req.body;

      const gameService = DatabaseServiceFactory.getGameService();
      const updatedGame = await gameService.updateGame(gameId, { gameName, gameType });

      res.json({
        message: "Game updated successfully",
        game: updatedGame,
      });
    } catch (error) {
      console.error("Update game error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete game (owner only)
router.delete(
  "/:gameId",
  authenticateToken,
  requireGameOwner,
  async (req, res) => {
    try {
      const { gameId } = req.params;

      const gameService = DatabaseServiceFactory.getGameService();
      await gameService.deleteGame(gameId);

      console.log(`[Game Deletion] Game ${gameId} deleted successfully`);
      res.json({ message: "Game deleted successfully" });
    } catch (error) {
      console.error("Delete game error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Add player to game or send invitation
router.post(
  "/:gameId/players",
  authenticateToken,
  requireGameOwner,
  async (req, res) => {
    try {
      const { gameId } = req.params;
      const { userEmail } = req.body;

      if (!userEmail) {
        return res.status(400).json({ error: "User email is required" });
      }

      const normalizedEmail = userEmail.toLowerCase();

      // Get game information
      const game = await db.get("SELECT * FROM pickem_games WHERE id = ?", [
        gameId,
      ]);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Get inviter information
      const userService = DatabaseServiceFactory.getUserService();
      const inviter = await userService.getUserBasicInfo(req.user.id);

      // Check if user already exists
      const existingUser = await userService.getUserByEmail(normalizedEmail);

      if (existingUser) {
        // User exists - add them directly to the game

        // Check if user is already in the game
        let existingParticipant;
        if (db.getType() === 'dynamodb') {
          // For DynamoDB, get all participants and filter in JavaScript
          const allParticipants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [gameId]);
          existingParticipant = allParticipants.find(p => p.user_id === existingUser.id);
        } else {
          // For SQLite, use the efficient query
          existingParticipant = await db.get(
            `
          SELECT id FROM game_participants
          WHERE game_id = ? AND user_id = ?
        `,
            [gameId, existingUser.id]
          );
        }

        if (existingParticipant) {
          return res
            .status(409)
            .json({ error: "User is already in this game" });
        }

        // Add user as player
        await db.run(
          `
        INSERT INTO game_participants (id, game_id, user_id, role)
        VALUES (?, ?, ?, 'player')
      `,
          [uuidv4(), gameId, existingUser.id]
        );

        res.json({
          message: "Player added successfully",
          type: "direct_add",
          player: {
            id: existingUser.id,
            email: existingUser.email,
          },
        });
      } else {
        // User doesn't exist - send invitation

        // Check if invitation already exists
        const invitationService = DatabaseServiceFactory.getInvitationService();
        const existingInvitation = await invitationService.checkExistingInvitation(gameId, normalizedEmail);

        if (existingInvitation) {
          return res
            .status(409)
            .json({ error: "Invitation already sent to this email" });
        }

        // Create invitation
        const inviteToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

        await invitationService.createInvitation({
          gameId,
          email: normalizedEmail,
          invitedByUserId: req.user.id,
          inviteToken,
          expiresAt: expiresAt.toISOString()
        });

        // Send invitation email
        const emailResult = await emailService.sendGameInvitation(
          normalizedEmail,
          `${inviter.first_name} ${inviter.last_name}`,
          game.game_name,
          inviteToken
        );

        if (!emailResult.success) {
          console.error("Failed to send invitation email:", emailResult.error);
          // Still return success since the invitation was saved to database
        }

        res.json({
          message: "Invitation sent successfully",
          type: "invitation_sent",
          email: normalizedEmail,
        });
      }
    } catch (error) {
      console.error("Add player error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Remove player from game
router.delete(
  "/:gameId/players/:userId",
  authenticateToken,
  requireGameOwner,
  async (req, res) => {
    try {
      const { gameId, userId } = req.params;

      let participant;
      if (db.getType() === 'dynamodb') {
        // For DynamoDB, get all participants and filter in JavaScript
        const allParticipants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [gameId]);
        participant = allParticipants.find(p => p.user_id === userId);
      } else {
        // For SQLite, use the efficient query
        participant = await db.get(
          `
        SELECT id, role FROM game_participants
        WHERE game_id = ? AND user_id = ?
      `,
          [gameId, userId]
        );
      }

      if (!participant) {
        return res.status(404).json({ error: "User is not in this game" });
      }

      // Don't allow removing owners
      if (participant.role === "owner") {
        return res.status(400).json({ error: "Cannot remove game owner" });
      }

      await db.run(
        `
      DELETE FROM game_participants 
      WHERE game_id = ? AND user_id = ?
    `,
        [gameId, userId]
      );

      // Also remove any picks for this user in this game
      await db.run(
        `
      DELETE FROM picks 
      WHERE user_id = ? AND game_id = ?
    `,
        [userId, gameId]
      );

      res.json({ message: "Player removed successfully" });
    } catch (error) {
      console.error("Remove player error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get invitations for a specific game (game owner only)
router.get("/:gameId/invitations", authenticateToken, requireGameOwner, async (req, res) => {
  try {
    const { gameId } = req.params;

    // Get invitations for this game
    const invitationService = DatabaseServiceFactory.getInvitationService();
    const gameInvitations = await invitationService.getGameInvitations(gameId);

    const userService = DatabaseServiceFactory.getUserService();
    const invitations = await Promise.all(gameInvitations.map(async (invitation) => {
      let invited_by_name = 'Unknown';
      if (invitation.invited_by_user_id) {
        const inviter = await userService.getUserBasicInfo(invitation.invited_by_user_id);
        if (inviter) {
          invited_by_name = `${inviter.first_name} ${inviter.last_name}`;
        }
      }
      return {
        ...invitation,
        invited_by_name
      };
    }));

    res.json({ invitations });
  } catch (error) {
    console.error("Get game invitations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cancel invitation (game owner only)
router.delete("/:gameId/invitations/:invitationId", authenticateToken, requireGameOwner, async (req, res) => {
  try {
    const { gameId, invitationId } = req.params;

    // Verify invitation exists and belongs to this game
    const invitationService = DatabaseServiceFactory.getInvitationService();
    const invitation = await invitationService.getInvitationById(invitationId);

    if (!invitation || invitation.game_id !== gameId) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    // Cancel the invitation
    await invitationService.updateInvitationStatus(invitationId, 'cancelled');

    res.json({ message: "Invitation cancelled successfully" });
  } catch (error) {
    console.error("Cancel invitation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
