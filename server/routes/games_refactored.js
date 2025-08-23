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
      
      // Get game information
      const game = await gameService.getGameById(gameId, req.user.id);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      // This logic would need to be moved to a UserService or remain here
      // For now, keeping the user lookup logic as it was...
      // The email invitation logic would also need refactoring

      res.json({
        message: "This endpoint needs UserService implementation",
        type: "placeholder"
      });
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

export default router;