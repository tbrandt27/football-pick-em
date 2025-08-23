import express from "express";
import { v4 as uuidv4 } from "uuid";
import { authenticateToken, requireGameOwner } from "../middleware/auth.js";
import db from "../models/database.js";
import emailService from "../services/emailService.js";
import crypto from "crypto";
import DatabaseServiceFactory from "../services/database/DatabaseServiceFactory.js";

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
    // Handle different database types
    let games;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get user's participations first, then games
      const userParticipations = await db.all('SELECT * FROM game_participants WHERE user_id = ?', [req.user.id]);
      
      games = await Promise.all(userParticipations.map(async (participation) => {
        // Get the game details
        const game = await db.get('SELECT * FROM pickem_games WHERE id = ?', [participation.game_id]);
        if (!game) return null;
        
        // Get all participants for counts
        const allParticipants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [participation.game_id]);
        
        return {
          ...game,
          user_role: participation.role,
          player_count: allParticipants.length,
          owner_count: allParticipants.filter(p => p.role === 'owner').length
        };
      }));
      
      // Filter out null values and sort by creation date
      games = games.filter(g => g !== null).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      // For SQLite, use the optimized JOIN query
      games = await db.all(
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
    }

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

    // Handle different database types
    let games;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get all games and commissioners separately
      const allGames = await db.all('SELECT * FROM pickem_games');
      
      games = await Promise.all(allGames.map(async (game) => {
        let commissioner_name = 'Unknown';
        if (game.commissioner_id) {
          const userService = DatabaseServiceFactory.getUserService();
          const commissioner = await userService.getUserBasicInfo(game.commissioner_id);
          if (commissioner) {
            commissioner_name = `${commissioner.first_name} ${commissioner.last_name}`;
          }
        }
        return {
          ...game,
          commissioner_name
        };
      }));
    } else {
      // For SQLite, get all games and commissioners separately to avoid JOIN
      const allGames = await db.all('SELECT * FROM pickem_games');
      const userService = DatabaseServiceFactory.getUserService();
      
      games = await Promise.all(allGames.map(async (game) => {
        let commissioner_name = 'Unknown';
        if (game.commissioner_id) {
          const commissioner = await userService.getUserBasicInfo(game.commissioner_id);
          if (commissioner) {
            commissioner_name = `${commissioner.first_name} ${commissioner.last_name}`;
          }
        }
        return {
          ...game,
          commissioner_name
        };
      }));
    }

    // Find game by matching slug
    const game = games.find((g) => createGameSlug(g.game_name) === decodedSlug);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Check if user is participant, commissioner, or admin
    let isParticipant;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get all participants for this game and filter in JavaScript
      const allParticipants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [game.id]);
      isParticipant = allParticipants.find(p => p.user_id === userId);
    } else {
      // For SQLite, use the efficient query
      isParticipant = await db.get(
        `
        SELECT id FROM game_participants
        WHERE game_id = ? AND user_id = ?
      `,
        [game.id, userId]
      );
    }

    const isCommissioner = game.commissioner_id === userId;
    const isAdmin = req.user.is_admin;

    if (!isParticipant && !isCommissioner && !isAdmin) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get participants
    let participants;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get participants and users separately
      const gameParticipants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [game.id]);
      
      participants = await Promise.all(gameParticipants.map(async (gp) => {
        const userService = DatabaseServiceFactory.getUserService();
        const user = await userService.getUserBasicInfo(gp.user_id);
        return {
          ...gp,
          display_name: user ? `${user.first_name} ${user.last_name}` : ''
        };
      }));
      
      // Sort by creation date
      participants.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
      // For SQLite, get participants and users separately to avoid JOIN
      const gameParticipants = await db.all('SELECT * FROM game_participants WHERE game_id = ? ORDER BY created_at', [game.id]);
      const userService = DatabaseServiceFactory.getUserService();
      
      participants = await Promise.all(gameParticipants.map(async (gp) => {
        const user = await userService.getUserBasicInfo(gp.user_id);
        return {
          ...gp,
          display_name: user ? `${user.first_name} ${user.last_name}` : ''
        };
      }));
    }

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
    let participant;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get all participants for this game and filter in JavaScript
      const allParticipants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [gameId]);
      participant = allParticipants.find(p => p.user_id === req.user.id);
    } else {
      // For SQLite, use the efficient JOIN query
      participant = await db.get(
        `
        SELECT role FROM game_participants
        WHERE game_id = ? AND user_id = ?
      `,
        [gameId, req.user.id]
      );
    }

    if (!participant && !req.user.is_admin) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Handle different database types
    let game;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get game directly and calculate counts separately
      game = await db.get('SELECT * FROM pickem_games WHERE id = ?', [gameId]);
      
      if (game) {
        // Get participant counts manually
        const participants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [gameId]);
        game.player_count = participants.length;
        game.owner_count = participants.filter(p => p.role === 'owner').length;
      }
    } else {
      // For SQLite, use the optimized query
      game = await db.get(
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
    }

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Get participants
    let participants;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get participants and users separately
      const gameParticipants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [gameId]);
      
      participants = await Promise.all(gameParticipants.map(async (gp) => {
        const userService = DatabaseServiceFactory.getUserService();
        const user = await userService.getUserBasicInfo(gp.user_id);
        return {
          role: gp.role,
          id: gp.id,
          user_id: gp.user_id,
          first_name: user?.first_name || '',
          last_name: user?.last_name || '',
          email: user?.email || '',
          display_name: user ? `${user.first_name} ${user.last_name}` : ''
        };
      }));
      
      // Sort participants
      participants.sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === 'owner' ? -1 : 1;
        }
        return a.first_name.localeCompare(b.first_name);
      });
    } else {
      // For SQLite, get participants and users separately to avoid JOIN
      const gameParticipants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [gameId]);
      const userService = DatabaseServiceFactory.getUserService();
      
      participants = await Promise.all(gameParticipants.map(async (gp) => {
        const user = await userService.getUserBasicInfo(gp.user_id);
        return {
          role: gp.role,
          id: gp.id,
          user_id: gp.user_id,
          first_name: user?.first_name || '',
          last_name: user?.last_name || '',
          email: user?.email || '',
          display_name: user ? `${user.first_name} ${user.last_name}` : ''
        };
      }));
      
      // Sort participants
      participants.sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === 'owner' ? -1 : 1;
        }
        return a.first_name.localeCompare(b.first_name);
      });
    }

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

    // Get current season - ensure only one active season
    // Handle both SQLite (is_current = 1) and DynamoDB (is_current = true)
    let currentSeason;
    if (db.getType && db.getType() === 'dynamodb') {
      // For DynamoDB, get all seasons and filter in code
      const allSeasons = await db.all('SELECT * FROM seasons');
      currentSeason = allSeasons.find(s => s.is_current === true || s.is_current === 1);
    } else {
      // For SQLite, use SQL with numeric 1
      currentSeason = await db.get(
        "SELECT id FROM seasons WHERE is_current = 1"
      );
    }
    if (!currentSeason) {
      return res.status(400).json({
        error: "No current season set. Please contact an administrator.",
      });
    }

    // Convert gameType to match database values
    const dbGameType = gameType === "week" ? "weekly" : "survivor";

    // Create the game (note: using game_name column, not name) - set as active by default
    await db.run(
      `
      INSERT INTO pickem_games (id, game_name, type, commissioner_id, season_id, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `,
      [gameId, gameName, dbGameType, req.user.id, currentSeason.id]
    );

    // Add creator as owner
    await db.run(
      `
      INSERT INTO game_participants (id, game_id, user_id, role)
      VALUES (?, ?, ?, 'owner')
    `,
      [uuidv4(), gameId, req.user.id]
    );

    // Get the newly created game with counts
    let newGame;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get game directly and calculate counts
      newGame = await db.get('SELECT * FROM pickem_games WHERE id = ?', [gameId]);
      if (newGame) {
        const participants = await db.all('SELECT * FROM game_participants WHERE game_id = ?', [gameId]);
        newGame.player_count = participants.length;
        newGame.owner_count = participants.filter(p => p.role === 'owner').length;
      }
    } else {
      // For SQLite, use the optimized query
      newGame = await db.get(
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
    }

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
      SET game_name = ?, type = ?, updated_at = ?
      WHERE id = ?
    `,
        [
          gameName || existingGame.game_name,
          gameType || existingGame.type,
          new Date().toISOString(),
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

      // Delete related records manually to handle foreign key constraints
      await db.run("DELETE FROM picks WHERE game_id = ?", [gameId]);
      await db.run("DELETE FROM weekly_standings WHERE game_id = ?", [gameId]);
      await db.run("DELETE FROM game_invitations WHERE game_id = ?", [gameId]);
      await db.run("DELETE FROM game_participants WHERE game_id = ?", [gameId]);
      
      // Finally delete the game itself
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
        const existingInvitation = await db.get(
          `
        SELECT * FROM game_invitations
        WHERE game_id = ? AND email = ? AND status = 'pending'
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
    let invitations;
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get invitations and inviter info separately
      const gameInvitations = await db.all(
        'SELECT * FROM game_invitations WHERE game_id = ? AND status = ?',
        [gameId, 'pending']
      );

      const userService = DatabaseServiceFactory.getUserService();
      invitations = await Promise.all(gameInvitations.map(async (invitation) => {
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
    } else {
      // For SQLite, get invitations and inviter info separately to avoid JOIN
      const gameInvitations = await db.all(
        'SELECT * FROM game_invitations WHERE game_id = ? AND status = ? ORDER BY created_at DESC',
        [gameId, 'pending']
      );

      const userService = DatabaseServiceFactory.getUserService();
      invitations = await Promise.all(gameInvitations.map(async (invitation) => {
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
    }

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

    // Verify invitation belongs to this game
    const invitation = await db.get(
      "SELECT id FROM game_invitations WHERE id = ? AND game_id = ?",
      [invitationId, gameId]
    );

    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    // Update invitation status to cancelled
    await db.run(
      `UPDATE game_invitations
       SET status = 'cancelled', updated_at = ?
       WHERE id = ?`,
      [new Date().toISOString(), invitationId]
    );

    res.json({ message: "Invitation cancelled successfully" });
  } catch (error) {
    console.error("Cancel invitation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
