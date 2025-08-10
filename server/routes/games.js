import express from "express";
import { v4 as uuidv4 } from "uuid";
import { authenticateToken, requireGameOwner } from "../middleware/auth.js";
import db from "../models/database.js";
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
    // All users (including admins) see only games they participate in on their dashboard
    const games = await db.all(
      `
      SELECT
        g.*,
        gp.role as user_role,
        COUNT(gp2.id) as player_count,
        COUNT(CASE WHEN gp2.role = 'owner' THEN 1 END) as owner_count
      FROM game_participants gp
      JOIN pickem_games g ON gp.game_id = g.id
      LEFT JOIN game_participants gp2 ON g.id = gp2.game_id
      WHERE gp.user_id = ?
      GROUP BY g.id, gp.role
      ORDER BY g.created_at DESC
    `,
      [req.user.id]
    );

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

    // Get all games and find the one that matches the slug
    const games = await db.all(`
      SELECT g.*, u.first_name || ' ' || u.last_name as commissioner_name
      FROM pickem_games g
      LEFT JOIN users u ON g.commissioner_id = u.id
    `);

    // Find game by matching slug
    const game = games.find((g) => createGameSlug(g.game_name) === decodedSlug);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Check if user is participant, commissioner, or admin
    const isParticipant = await db.get(
      `
      SELECT 1 FROM game_participants
      WHERE game_id = ? AND user_id = ?
    `,
      [game.id, userId]
    );

    const isCommissioner = game.commissioner_id === userId;
    const isAdmin = req.user.is_admin;

    if (!isParticipant && !isCommissioner && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get participants
    const participants = await db.all(
      `
      SELECT gp.*, u.first_name || ' ' || u.last_name as display_name
      FROM game_participants gp
      JOIN users u ON gp.user_id = u.id
      WHERE gp.game_id = ?
      ORDER BY gp.created_at
    `,
      [game.id]
    );

    res.json({
      game: {
        ...game,
        participants,
        player_count: participants.length,
      },
    });
  } catch (error) {
    console.error("Get game by slug error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get specific game
router.get("/:gameId", authenticateToken, async (req, res) => {
  try {
    const { gameId } = req.params;

    // Check if user has access to this game
    const participant = await db.get(
      `
      SELECT role FROM game_participants 
      WHERE game_id = ? AND user_id = ?
    `,
      [gameId, req.user.id]
    );

    if (!participant && !req.user.is_admin) {
      return res.status(403).json({ error: "Access denied" });
    }

    const game = await db.get(
      `
      SELECT 
        g.*,
        COUNT(gp.id) as player_count,
        COUNT(CASE WHEN gp.role = 'owner' THEN 1 END) as owner_count
      FROM pickem_games g
      LEFT JOIN game_participants gp ON g.id = gp.game_id
      WHERE g.id = ?
      GROUP BY g.id
    `,
      [gameId]
    );

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Get participants
    const participants = await db.all(
      `
      SELECT 
        gp.role,
        gp.id,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.first_name || ' ' || u.last_name as display_name
      FROM game_participants gp
      JOIN users u ON gp.user_id = u.id
      WHERE gp.game_id = ?
      ORDER BY gp.role, u.first_name, u.last_name
    `,
      [gameId]
    );

    res.json({
      game: {
        ...game,
        participants,
      },
    });
  } catch (error) {
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

    const gameId = uuidv4();

    // Get current season
    const currentSeason = await db.get(
      "SELECT id FROM seasons WHERE is_current = 1"
    );
    if (!currentSeason) {
      return res.status(400).json({
        error: "No current season set. Please contact an administrator.",
      });
    }

    // Create the game
    await db.run(
      `
      INSERT INTO pickem_games (id, name, type, commissioner_id, season_id)
      VALUES (?, ?, ?, ?, ?)
    `,
      [gameId, gameName, gameType, req.user.id, currentSeason.id]
    );

    // Add creator as owner
    await db.run(
      `
      INSERT INTO game_participants (id, game_id, user_id, role)
      VALUES (?, ?, ?, 'owner')
    `,
      [uuidv4(), gameId, req.user.id]
    );

    const newGame = await db.get(
      `
      SELECT 
        g.*,
        COUNT(gp.id) as player_count,
        COUNT(CASE WHEN gp.role = 'owner' THEN 1 END) as owner_count
      FROM pickem_games g
      LEFT JOIN game_participants gp ON g.id = gp.game_id
      WHERE g.id = ?
      GROUP BY g.id
    `,
      [gameId]
    );

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

      const existingGame = await db.get(
        "SELECT * FROM pickem_games WHERE id = ?",
        [gameId]
      );
      if (!existingGame) {
        return res.status(404).json({ error: "Game not found" });
      }

      await db.run(
        `
      UPDATE pickem_games 
      SET game_name = ?, game_type = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
        [
          gameName || existingGame.game_name,
          gameType || existingGame.game_type,
          gameId,
        ]
      );

      const updatedGame = await db.get(
        "SELECT * FROM pickem_games WHERE id = ?",
        [gameId]
      );

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

      const existingGame = await db.get(
        "SELECT id FROM pickem_games WHERE id = ?",
        [gameId]
      );
      if (!existingGame) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Delete game (cascading deletes will handle participants, picks, etc.)
      await db.run("DELETE FROM pickem_games WHERE id = ?", [gameId]);

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
      const inviter = await db.get(
        "SELECT first_name, last_name FROM users WHERE id = ?",
        [req.user.id]
      );

      // Check if user already exists
      const existingUser = await db.get(
        "SELECT id, email FROM users WHERE email = ?",
        [normalizedEmail]
      );

      if (existingUser) {
        // User exists - add them directly to the game

        // Check if user is already in the game
        const existingParticipant = await db.get(
          `
        SELECT id FROM game_participants 
        WHERE game_id = ? AND user_id = ?
      `,
          [gameId, existingUser.id]
        );

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
        const existingInvitation = await db.get(
          `
        SELECT * FROM game_invitations 
        WHERE game_id = ? AND email = ? AND status = 'pending' AND expires_at > datetime('now')
      `,
          [gameId, normalizedEmail]
        );

        if (existingInvitation) {
          return res
            .status(409)
            .json({ error: "Invitation already sent to this email" });
        }

        // Create invitation
        const inviteToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

        await db.run(
          `
        INSERT INTO game_invitations (id, game_id, email, invited_by_user_id, invite_token, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
          [
            uuidv4(),
            gameId,
            normalizedEmail,
            req.user.id,
            inviteToken,
            expiresAt.toISOString(),
          ]
        );

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

      const participant = await db.get(
        `
      SELECT id, role FROM game_participants 
      WHERE game_id = ? AND user_id = ?
    `,
        [gameId, userId]
      );

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

export default router;
