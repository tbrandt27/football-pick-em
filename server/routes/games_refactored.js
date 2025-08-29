import express from "express";
import { authenticateToken, requireGameOwner } from "../middleware/auth.js";
import DatabaseServiceFactory from "../services/database/DatabaseServiceFactory.js";
import emailService from "../services/emailService.js";
import crypto from "crypto";

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
    const decodedSlug = decodeURIComponent(gameSlug);
    
    const gameService = DatabaseServiceFactory.getGameService();
    const game = await gameService.getGameBySlug(decodedSlug, req.user.id);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    res.json({ game });
  } catch (error) {
    if (error.message === 'Access denied') {
      return res.status(403).json({ error: "Access denied" });
    }
    console.error("Get game by slug error:", error);
    res.status(500).json({ error: "Internal server error" });
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

    res.json({ game });
  } catch (error) {
    if (error.message === 'Access denied') {
      return res.status(403).json({ error: "Access denied" });
    }
    console.error("Get game error:", error);
    res.status(500).json({ error: "Internal server error" });
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

    // Get current season
    const seasonService = DatabaseServiceFactory.getSeasonService();
    const currentSeason = await seasonService.getCurrentSeason();
    
    if (!currentSeason) {
      return res.status(400).json({
        error: "No current season set. Please contact an administrator.",
      });
    }

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
      const updatedGame = await gameService.updateGame(gameId, {
        gameName,
        gameType
      });

      res.json({
        message: "Game updated successfully",
        game: updatedGame,
      });
    } catch (error) {
      if (error.message === 'Game not found') {
        return res.status(404).json({ error: "Game not found" });
      }
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

      res.json({ message: "Game deleted successfully" });
    } catch (error) {
      if (error.message === 'Game not found') {
        return res.status(404).json({ error: "Game not found" });
      }
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

      const gameService = DatabaseServiceFactory.getGameService();
      const userService = DatabaseServiceFactory.getUserService();
      
      // Get game information
      const game = await gameService.getGameById(gameId, req.user.id);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Get inviter information
      const inviter = await userService.getUserBasicInfo(req.user.id);

      // Check if user already exists
      const existingUser = await userService.getUserByEmail(normalizedEmail);

      if (existingUser) {
        // User exists - check if already in game
        const existingParticipant = await gameService.getParticipant(gameId, existingUser.id);

        if (existingParticipant) {
          return res.status(409).json({ error: "User is already in this game" });
        }

        // Add user as player
        const participant = await gameService.addParticipant(gameId, existingUser.id, 'player');

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

      const gameService = DatabaseServiceFactory.getGameService();
      await gameService.removeParticipant(gameId, userId);

      res.json({ message: "Player removed successfully" });
    } catch (error) {
      if (error.message === 'User is not in this game') {
        return res.status(404).json({ error: "User is not in this game" });
      }
      if (error.message === 'Cannot remove game owner') {
        return res.status(400).json({ error: "Cannot remove game owner" });
      }
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