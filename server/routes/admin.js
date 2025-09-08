import express from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { seedTeams, updateTeamLogos } from "../utils/seedTeams.js";
import espnService from "../services/espnApi.js";
import scheduler from "../services/scheduler.js";
import pickCalculator from "../services/pickCalculator.js";
import onDemandUpdates from "../services/onDemandUpdates.js";
import configService from "../services/configService.js";
import db from "../models/database.js";
import crypto from "crypto";
import emailService from "../services/emailService.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import DatabaseServiceFactory from "../services/database/DatabaseServiceFactory.js";
import logger from "../utils/logger.js";

const router = express.Router();

// Get application version from package.json
router.get("/version", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packageJsonPath = path.join(__dirname, "../../package.json");
    
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    
    res.json({
      version: packageJson.version,
      name: packageJson.name
    });
  } catch (error) {
    logger.error("Get version error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get admin dashboard stats
router.get("/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userService = DatabaseServiceFactory.getUserService();
    const gameService = DatabaseServiceFactory.getGameService();
    const seasonService = DatabaseServiceFactory.getSeasonService();
    
    const [userCount, gameCount, teamCount, seasonCount] = await Promise.all([
      userService.getUserCount(),
      gameService.getGameCount(),
      seasonService.getTeamCount(),
      seasonService.getSeasonCount(),
    ]);

    res.json({
      stats: {
        users: userCount || 0,
        games: gameCount || 0,
        teams: teamCount || 0,
        seasons: seasonCount || 0,
      },
    });
  } catch (error) {
    logger.error("Get admin stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Seed NFL teams
router.post(
  "/seed-teams",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      await seedTeams();
      res.json({ message: "NFL teams seeded successfully" });
    } catch (error) {
      logger.error("Seed teams error:", error);
      res.status(500).json({ error: "Failed to seed teams" });
    }
  }
);

// Update team logos
router.post(
  "/update-team-logos",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      await updateTeamLogos();
      res.json({ message: "Team logos updated successfully" });
    } catch (error) {
      logger.error("Update team logos error:", error);
      res.status(500).json({ error: "Failed to update team logos" });
    }
  }
);


// Get available team logos
router.get("/team-logos", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Use exact same logic as the working /logos/:filename route in server/index.js
    const explicitLogosPath = process.env.LOGOS_PATH;
    
    // Always try multiple paths for better reliability in different deployment environments
    const possibleLogoPaths = [
      // Try explicit path first if set
      ...(explicitLogosPath ? [explicitLogosPath] : []),
      // Standard relative path from current working directory
      path.join(process.cwd(), "public/logos"),
      // Path relative to server directory structure
      path.join(__dirname, "../public/logos"),
      path.join(__dirname, "../../public/logos"),
      // Path relative to project root in different deployment scenarios
      path.join(process.env.APP_ROOT || process.cwd(), "public/logos"),
      "/app/public/logos", // Common Docker path
      "/var/app/current/public/logos", // AWS App Runner path
      // Additional AWS App Runner paths
      path.join(process.cwd(), "../public/logos"),
      path.join(process.cwd(), "dist/client/logos"),
      path.join(__dirname, "../../dist/client/logos"),
      // Try relative to the built client directory
      path.join(process.cwd(), "dist/public/logos"),
      path.join(__dirname, "../dist/public/logos"),
    ];

    let logosPath = null;
    for (const testPath of possibleLogoPaths) {
      if (fs.existsSync(testPath)) {
        logosPath = testPath;
        logger.debug(`Admin API: Found logos directory at ${testPath}`);
        break;
      }
    }

    if (!logosPath) {
      logger.error("Admin API: Logos directory not found. Tried paths:", possibleLogoPaths);
      return res.status(404).json({
        error: "Logos directory not found",
        triedPaths: possibleLogoPaths,
        debugInfo: {
          cwd: process.cwd(),
          __dirname,
          envLogosPath: process.env.LOGOS_PATH,
          envAppRoot: process.env.APP_ROOT,
          nodeEnv: process.env.NODE_ENV
        },
        note: "Individual logos may still work via direct URL"
      });
    }

    const logoFiles = fs
      .readdirSync(logosPath)
      .filter((file) => file.endsWith(".svg"))
      .sort();

    logger.debug(`Admin API: Found ${logoFiles.length} logo files in ${logosPath}`);
    res.json({ logos: logoFiles });
  } catch (error) {
    logger.error("Admin API: Get team logos error:", error);
    res
      .status(500)
      .json({ error: `Failed to get team logos: ${error.message}` });
  }
});

// Debug endpoint to help troubleshoot logos directory issues in production
router.get("/debug/paths", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const debugInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      __filename,
      __dirname,
      envAppRoot: process.env.APP_ROOT,
      envLogosPath: process.env.LOGOS_PATH,
    };

    // Test all possible paths
    const possiblePaths = [
      path.join(process.cwd(), "public/logos"),
      path.join(__dirname, "../../public/logos"),
      path.join(__dirname, "../../../public/logos"),
      path.resolve("public/logos"),
      path.resolve("./public/logos"),
      path.join(process.env.APP_ROOT || process.cwd(), "public/logos"),
      "/app/public/logos",
      "/var/app/current/public/logos",
    ];

    const pathTests = [];
    for (const testPath of possiblePaths) {
      try {
        const exists = fs.existsSync(testPath);
        const result = { path: testPath, exists };
        
        if (exists) {
          try {
            const contents = fs.readdirSync(testPath);
            result.contents = contents.slice(0, 10); // Limit to first 10 items
            result.svgCount = contents.filter(f => f.endsWith('.svg')).length;
          } catch (err) {
            result.error = err.message;
          }
        }
        
        pathTests.push(result);
      } catch (err) {
        pathTests.push({ path: testPath, exists: false, error: err.message });
      }
    }

    // Check if public directory exists
    const publicDirTests = [
      path.join(process.cwd(), "public"),
      path.join(__dirname, "../../public"),
      "/app/public",
      "/var/app/current/public",
    ];

    const publicTests = [];
    for (const testPath of publicDirTests) {
      try {
        const exists = fs.existsSync(testPath);
        const result = { path: testPath, exists };
        
        if (exists) {
          try {
            const contents = fs.readdirSync(testPath);
            result.contents = contents;
          } catch (err) {
            result.error = err.message;
          }
        }
        
        publicTests.push(result);
      } catch (err) {
        publicTests.push({ path: testPath, exists: false, error: err.message });
      }
    }

    res.json({
      debugInfo,
      pathTests,
      publicTests,
    });
  } catch (error) {
    logger.error("Debug paths error:", error);
    res.status(500).json({ error: `Debug error: ${error.message}` });
  }
});

// Sync NFL schedule from ESPN
router.post("/sync-espn", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { seasonId, week } = req.body;

    if (!seasonId) {
      return res.status(400).json({ error: "Season ID is required" });
    }

    // Verify season exists
    const seasonService = DatabaseServiceFactory.getSeasonService();
    const season = await seasonService.getSeasonById(seasonId);
    if (!season) {
      return res.status(404).json({ error: "Season not found" });
    }

    const result = await espnService.updateNFLGames(seasonId, week);

    res.json({
      message: `ESPN sync completed for ${season.season}${
        week ? ` week ${week}` : ""
      }`,
      ...result,
    });
  } catch (error) {
    logger.error("ESPN sync error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to sync with ESPN" });
  }
});

// Update current week scores
router.post(
  "/update-scores",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const results = await espnService.updateGameScores();

      res.json({
        message: "Game scores updated successfully",
        results,
      });
    } catch (error) {
      logger.error("Update scores error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to update scores" });
    }
  }
);

// Get all users (for user management)
router.get("/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, get users and game counts using service layer
      const userService = DatabaseServiceFactory.getUserService();
      const users = await userService.getAllUsers();
      
      // For each user, get game count using GSI for efficient lookup
      const usersWithGameCount = await Promise.all(
        users.map(async (user) => {
          try {
            // Use GSI user_id-index for efficient lookup of game participations
            const gameParticipations = await db.provider._getByUserIdGSI('game_participants', user.id);
            return {
              ...user,
              game_count: gameParticipations ? gameParticipations.length : 0
            };
          } catch (error) {
            logger.warn(`Could not get game count for user ${user.id}:`, error);
            return {
              ...user,
              game_count: 0
            };
          }
        })
      );
      
      res.json({ users: usersWithGameCount });
    } else {
      // For SQLite, use the service layer
      const userService = DatabaseServiceFactory.getUserService();
      const users = await userService.getAllUsersWithGameCount();

      res.json({ users });
    }
  } catch (error) {
    logger.error("Get admin users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all pending invitations
router.get(
  "/invitations",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const invitationService = DatabaseServiceFactory.getInvitationService();
      const invitations = await invitationService.getPendingInvitations();
      
      res.json({ invitations });
    } catch (error) {
      logger.error("Get admin invitations error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Cancel invitation
router.delete(
  "/invitations/:invitationId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { invitationId } = req.params;

      const invitationService = DatabaseServiceFactory.getInvitationService();
      const invitation = await invitationService.cancelInvitation(invitationId);

      res.json({
        message: `Invitation for ${invitation.email} cancelled successfully`,
      });
    } catch (error) {
      logger.error("Cancel invitation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get invitation by token (for registration validation)
router.get(
  "/invitations/token/:token",
  async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      const invitationService = DatabaseServiceFactory.getInvitationService();
      const invitation = await invitationService.getInvitationByToken(token);

      if (!invitation) {
        return res.status(404).json({ error: "Invalid or expired invitation token" });
      }

      // Check if invitation is expired
      if (invitation.expires_at <= new Date().toISOString()) {
        return res.status(404).json({ error: "Invitation has expired" });
      }

      // Check if invitation is still pending
      if (invitation.status !== 'pending') {
        return res.status(404).json({ error: "Invitation is no longer valid" });
      }

      res.json({
        invitation: {
          email: invitation.email,
          game_name: invitation.game_name || (invitation.is_admin_invitation ? 'Admin Invitation' : 'Unknown Game'),
          is_admin_invitation: invitation.is_admin_invitation || false,
          expires_at: invitation.expires_at,
          status: invitation.status
        }
      });
    } catch (error) {
      logger.error("Get invitation by token error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Manually confirm invitation (admin creates account for user)
router.post(
  "/invitations/:invitationId/confirm",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { invitationId } = req.params;
      const { firstName, lastName, tempPassword } = req.body;

      if (!firstName || !lastName || !tempPassword) {
        return res.status(400).json({
          error: "First name, last name, and temporary password are required"
        });
      }

      // Get invitation details
      const invitationService = DatabaseServiceFactory.getInvitationService();
      const invitation = await invitationService.getInvitationById(invitationId);

      if (!invitation || invitation.status !== 'pending' || invitation.expires_at <= new Date().toISOString()) {
        return res.status(404).json({ error: "Invalid or expired invitation" });
      }

      // Get game name - handle both regular and admin invitations
      let gameName = 'Admin Invitation';
      if (invitation.game_id) {
        // This is a regular game invitation - use admin bypass method
        const gameService = DatabaseServiceFactory.getGameService();
        try {
          // Try the new admin method first
          if (gameService.getGameByIdForAdmin) {
            const game = await gameService.getGameByIdForAdmin(invitation.game_id);
            if (game) {
              gameName = game.game_name;
            }
          } else {
            // Fallback to direct database access for admin operations
            if (db.getType() === 'dynamodb') {
              const gameResult = await db.get({
                action: 'get',
                table: 'pickem_games',
                key: { id: invitation.game_id }
              });
              if (gameResult && gameResult.Item) {
                gameName = gameResult.Item.game_name;
              }
            } else {
              const game = await db.get("SELECT game_name FROM pickem_games WHERE id = ?", [invitation.game_id]);
              if (game) {
                gameName = game.game_name;
              }
            }
          }
        } catch (error) {
          logger.warn(`Could not get game name for invitation ${invitationId}:`, error);
          // Use default name for admin invitations or when game lookup fails
        }
      }
      invitation.game_name = gameName;

      // Check if user already exists
      const userService = DatabaseServiceFactory.getUserService();
      const userExists = await userService.userExists(invitation.email);
      if (userExists) {
        return res.status(409).json({ error: "User with this email already exists" });
      }

      // Hash the temporary password
      const bcrypt = await import('bcryptjs');
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

      // Create user account
      const { v4: uuidv4 } = await import("uuid");
      const userId = uuidv4();
      const emailVerificationToken = uuidv4();
      
      const createdUser = await userService.createUser({
        id: userId,
        email: invitation.email,
        password: hashedPassword,
        firstName,
        lastName,
        favoriteTeamId: null,
        emailVerificationToken,
        emailVerified: true  // Admin-created accounts are pre-verified
      });

      // Add user to the game (only for regular game invitations)
      if (invitation.game_id) {
        const gameService = DatabaseServiceFactory.getGameService();
        await gameService.addParticipant(invitation.game_id, userId, 'player');
      }

      // Mark invitation as accepted
      await invitationService.updateInvitationStatus(invitation.id, 'accepted');

      res.json({
        message: `Account created for ${invitation.email} and added to "${invitation.game_name}". Temporary password: ${tempPassword}`,
        user: {
          id: userId,
          email: invitation.email,
          firstName,
          lastName,
          tempPassword
        },
        game: {
          id: invitation.game_id,
          name: invitation.game_name
        }
      });

    } catch (error) {
      logger.error("Confirm invitation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get all games (for game management)
router.get("/games", authenticateToken, requireAdmin, async (req, res) => {
  try {
    // First, let's migrate any games that might have NULL names or commissioner_ids
    await migrateGameData();

    const gameService = DatabaseServiceFactory.getGameService();
    const games = await gameService.getAllGamesWithDetails();
    
    res.json({ games });
  } catch (error) {
    logger.error("Get admin games error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper function to migrate old game data
async function migrateGameData() {
  try {
    const gameService = DatabaseServiceFactory.getGameService();
    const userService = DatabaseServiceFactory.getUserService();
    
    if (db.getType() === 'dynamodb') {
      // For DynamoDB, handle migrations differently
      const games = await gameService.getAllGames();
      
      for (const game of games) {
        let needsUpdate = false;
        const updates = {};
        
        // Fix missing game_name
        if (!game.game_name || game.game_name === '') {
          if (game.type === 'weekly' && game.weekly_week) {
            updates.game_name = `Week ${game.weekly_week} Picks`;
          } else if (game.type === 'survivor') {
            updates.game_name = 'Survivor Pool';
          } else {
            updates.game_name = 'Pick\'em Game';
          }
          needsUpdate = true;
        }
        
        // Fix missing is_active
        if (game.is_active === null || game.is_active === undefined) {
          updates.is_active = true;
          needsUpdate = true;
        }
        
        // Fix missing commissioner_id
        if (!game.commissioner_id || game.commissioner_id === '') {
          // Find first admin user
          const adminUser = await userService.getFirstAdminUser();
          if (adminUser) {
            updates.commissioner_id = adminUser.id;
            needsUpdate = true;
          } else {
            // Find any user
            const anyUser = await userService.getAnyUser();
            if (anyUser) {
              updates.commissioner_id = anyUser.id;
              needsUpdate = true;
            }
          }
        }
        
        if (needsUpdate) {
          await gameService.updateGameData(game.id, updates);
        }
      }
    } else {
      // For SQLite, use SQL queries through the service layer
      await gameService.migrateGameData();
      
      // Update games with NULL commissioner_id - set to first admin user
      const firstAdmin = await userService.getFirstAdminUser();
      if (firstAdmin) {
        await gameService.updateCommissionerForGamesWithoutCommissioner(firstAdmin.id);
      } else {
        // If no admin user, try to find any user
        const anyUser = await userService.getAnyUser();
        if (anyUser) {
          await gameService.updateCommissionerForGamesWithoutCommissioner(anyUser.id);
        }
      }
    }
  } catch (error) {
    logger.error("Game data migration error:", error);
  }
}

// Delete game (admin override)
router.delete(
  "/games/:gameId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { gameId } = req.params;

      logger.debug(`[Admin Game Deletion] Starting deletion for game: ${gameId}`);
      logger.debug(`[Admin Game Deletion] Database type: ${db.getType ? db.getType() : 'unknown'}`);

      // Use the game service layer for proper deletion handling
      const gameService = DatabaseServiceFactory.getGameService();
      
      // Get game info before deletion for response message using admin method
      let game;
      try {
        logger.debug(`[Admin Game Deletion] Attempting to get game info for ${gameId}`);
        game = await gameService.getGameByIdForAdmin(gameId);
        logger.debug(`[Admin Game Deletion] Game found:`, game ? 'Yes' : 'No');
        if (!game) {
          logger.debug(`[Admin Game Deletion] Game ${gameId} not found using service layer`);

          // Fallback: try direct database access for debugging
          logger.debug(`[Admin Game Deletion] Trying direct database access as fallback`);
          try {
            if (db.getType && db.getType() === 'dynamodb') {
              const directResult = await db.get({
                action: 'get',
                table: 'pickem_games',
                key: { id: gameId }
              });
              logger.debug(`[Admin Game Deletion] Direct DynamoDB result:`, directResult ? 'Found' : 'Not found');
              if (directResult && directResult.Item) {
                game = directResult.Item;
                logger.debug(`[Admin Game Deletion] Found game via direct access: ${game.game_name}`);
              }
            } else {
              const directResult = await db.get("SELECT * FROM pickem_games WHERE id = ?", [gameId]);
              logger.debug(`[Admin Game Deletion] Direct SQLite result:`, directResult ? 'Found' : 'Not found');
              if (directResult) {
                game = directResult;
                logger.debug(`[Admin Game Deletion] Found game via direct access: ${game.game_name}`);
              }
            }
          } catch (directError) {
            logger.error(`[Admin Game Deletion] Direct database access also failed:`, directError);
          }
          
          if (!game) {
            // For debugging, let's also try to list all games to see what's available
            try {
              const allGames = await gameService.getAllGames();
              logger.debug(`[Admin Game Deletion] Total games in database: ${allGames.length}`);
              logger.debug(`[Admin Game Deletion] Available game IDs:`, allGames.map(g => g.id).slice(0, 5));
            } catch (listError) {
              logger.error(`[Admin Game Deletion] Error listing games:`, listError);
            }
            
            return res.status(404).json({ error: "Game not found" });
          }
        }
      } catch (error) {
        logger.error(`[Admin Game Deletion] Error getting game info:`, error);
        logger.error(`[Admin Game Deletion] Error stack:`, error.stack);
        return res.status(404).json({ error: "Game not found" });
      }

      // Use the service layer deleteGame method which handles both SQLite and DynamoDB correctly
      logger.debug(`[Admin Game Deletion] Proceeding with deletion of game: ${game.game_name || 'Unknown'}`);
      await gameService.deleteGame(gameId);

      logger.info(`[Admin Game Deletion] Game ${gameId} deleted successfully`);
      res.json({
        message: `Game "${game.game_name || game.name || 'Unknown Game'}" deleted successfully`,
      });
    } catch (error) {
      logger.error("Admin delete game error:", error);
      logger.error("Admin delete game error stack:", error.stack);
      
      if (error.message === 'Game not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({
        error: "Internal server error",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Update user admin status
router.put(
  "/users/:userId/admin",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { isAdmin } = req.body;

      // Don't allow removing admin from self
      if (userId === req.user.id && !isAdmin) {
        return res
          .status(400)
          .json({ error: "Cannot remove admin status from yourself" });
      }

      const userService = DatabaseServiceFactory.getUserService();
      await userService.updateAdminStatus(userId, isAdmin);

      res.json({ message: "User admin status updated successfully" });
    } catch (error) {
      logger.error("Update user admin error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Manually verify user email (admin only)
router.put(
  "/users/:userId/verify-email",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Get user info before verification
      const userService = DatabaseServiceFactory.getUserService();
      const user = await userService.getUserBasicInfo(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Update email_verified status
      await userService.updateEmailVerified(userId, true);

      res.json({
        message: `Email verified for ${user.first_name} ${user.last_name} (${user.email})`,
      });
    } catch (error) {
      logger.error("Verify user email error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete user (admin only)
router.delete(
  "/users/:userId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Don't allow deleting yourself
      if (userId === req.user.id) {
        return res
          .status(400)
          .json({ error: "Cannot delete your own account" });
      }

      // Get user info before deletion
      const userService = DatabaseServiceFactory.getUserService();
      const user = await userService.getUserBasicInfo(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Delete related records manually to handle foreign key constraints
      if (db.getType() === 'dynamodb') {
        // For DynamoDB, use scans to find and delete records
        logger.debug(`[DynamoDB] Starting related records cleanup for user: ${userId}`);
        
        try {
          // Delete picks
          logger.debug(`[DynamoDB] Deleting picks for user: ${userId}`);
          const picksResult = await db.provider._dynamoScan('picks', { user_id: userId });
          if (picksResult.Items) {
            logger.debug(`[DynamoDB] Found ${picksResult.Items.length} picks to delete`);
            for (const pick of picksResult.Items) {
              // Ensure we have a valid pick ID before attempting deletion
              if (pick.id) {
                await db.provider._dynamoDelete('picks', { id: pick.id });
              } else {
                logger.warn(`[DynamoDB] Skipping pick deletion - missing ID:`, pick);
              }
            }
          } else {
            logger.debug(`[DynamoDB] No picks found for user`);
          }
          
          // Delete weekly standings
          logger.debug(`[DynamoDB] Deleting weekly standings for user: ${userId}`);
          const standingsResult = await db.provider._dynamoScan('weekly_standings', { user_id: userId });
          if (standingsResult.Items) {
            logger.debug(`[DynamoDB] Found ${standingsResult.Items.length} standings to delete`);
            for (const standing of standingsResult.Items) {
              // Ensure we have a valid standing ID before attempting deletion
              if (standing.id) {
                await db.provider._dynamoDelete('weekly_standings', { id: standing.id });
              } else {
                logger.warn(`[DynamoDB] Skipping standing deletion - missing ID:`, standing);
              }
            }
          } else {
            logger.debug(`[DynamoDB] No standings found for user`);
          }
          
          // Delete game invitations
          logger.debug(`[DynamoDB] Deleting invitations for user: ${userId}`);
          const invitationService = DatabaseServiceFactory.getInvitationService();
          await invitationService.deleteInvitationsByUser(userId, user.email);
          
          // Remove from game participants
          logger.debug(`[DynamoDB] Removing game participants for user: ${userId}`);
          const participantsResult = await db.provider._dynamoScan('game_participants', { user_id: userId });
          if (participantsResult.Items) {
            logger.debug(`[DynamoDB] Found ${participantsResult.Items.length} participant records to delete`);
            for (const participant of participantsResult.Items) {
              // Ensure we have a valid participant ID before attempting deletion
              if (participant.id) {
                logger.debug(`[DynamoDB] Deleting participant: ${participant.id}`);
                await db.provider._dynamoDelete('game_participants', { id: participant.id });
              } else {
                logger.warn(`[DynamoDB] Skipping participant deletion - missing ID:`, participant);
              }
            }
          } else {
            logger.debug(`[DynamoDB] No participant records found for user`);
          }
          
          // Update games where this user was commissioner (set to the requesting admin)
          logger.debug(`[DynamoDB] Updating commissioner for games owned by user: ${userId}`);
          const gamesResult = await db.provider._dynamoScan('pickem_games', { commissioner_id: userId });
          if (gamesResult.Items) {
            logger.debug(`[DynamoDB] Found ${gamesResult.Items.length} games to update commissioner`);
            for (const game of gamesResult.Items) {
              // Ensure we have a valid game ID before attempting update
              if (game.id) {
                await db.provider._dynamoUpdate('pickem_games', { id: game.id }, { commissioner_id: req.user.id });
              } else {
                logger.warn(`[DynamoDB] Skipping game commissioner update - missing ID:`, game);
              }
            }
          } else {
            logger.debug(`[DynamoDB] No games found where user was commissioner`);
          }
          
          logger.debug(`[DynamoDB] Successfully completed related records cleanup for user: ${userId}`);
        } catch (error) {
          logger.error(`[DynamoDB] Error during related records cleanup for user ${userId}:`, error);
          logger.error(`[DynamoDB] Error details:`, {
            message: error.message,
            code: error.name,
            stack: error.stack
          });
          throw error; // Re-throw to be caught by the main error handler
        }
      } else {
        // For SQLite, use service layer methods
        const pickService = DatabaseServiceFactory.getPickService();
        const gameService = DatabaseServiceFactory.getGameService();
        
        await pickService.deletePicksByUser(userId);
        await pickService.deleteStandingsByUser(userId);
        
        const invitationService = DatabaseServiceFactory.getInvitationService();
        await invitationService.deleteInvitationsByUser(userId, user.email);
        
        await gameService.removeParticipantFromAllGames(userId);
        await gameService.transferCommissionerRole(userId, req.user.id);
      }
      
      // Finally delete the user
      await userService.deleteUser(userId);

      res.json({
        message: `User "${user.first_name} ${user.last_name}" (${user.email}) deleted successfully`,
      });
    } catch (error) {
      logger.error("Delete user error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get all seasons (for season management)
router.get("/seasons", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const seasonService = DatabaseServiceFactory.getSeasonService();
    const seasons = await seasonService.getAllSeasonsWithCounts();
    
    res.json({ seasons });
  } catch (error) {
    logger.error("Get admin seasons error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new season
router.post("/seasons", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { year } = req.body;

    if (!year) {
      return res.status(400).json({ error: "Year is required" });
    }

    const seasonService = DatabaseServiceFactory.getSeasonService();
    
    // Check if season already exists
    const existingSeason = await seasonService.getSeasonByYear(year.toString());
    if (existingSeason) {
      return res.status(409).json({ error: "Season already exists" });
    }

    // Create season with proper object structure
    const newSeason = await seasonService.createSeason({
      season: year.toString(),
      isCurrent: false
    });

    res.status(201).json({
      message: "Season created successfully",
      season: newSeason,
    });
  } catch (error) {
    logger.error("Create season error:", error);
    if (error.message === 'Season already exists') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete season (admin only)
router.delete(
  "/seasons/:seasonId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      logger.debug(`[Admin] Delete season request for ID: ${seasonId}`);

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const gameService = DatabaseServiceFactory.getGameService();

      // Get season info before deletion using the service
      logger.debug(`[Admin] Looking up season with ID: ${seasonId}`);
      const season = await seasonService.getSeasonById(seasonId);
      
      logger.debug(`[Admin] Season lookup result:`, season);
      
      if (!season) {
        logger.debug(`[Admin] Season not found for ID: ${seasonId}`);
        return res.status(404).json({ error: "Season not found" });
      }

      // Check if season has any active pickem games using the service
      logger.debug(`[Admin] Checking for associated pickem games for season: ${seasonId}`);
      const gameCount = await gameService.getGameCountBySeason(seasonId);

      logger.debug(`[Admin] Game count result: ${gameCount}`);

      if (gameCount > 0) {
        logger.debug(`[Admin] Cannot delete season - has ${gameCount} associated games`);
        return res.status(400).json({
          error: `Cannot delete season ${season.season || season.year} - it has ${gameCount} associated pick'em games. Delete the games first.`
        });
      }

      // Use the service layer to delete the season (which handles football games too)
      logger.debug(`[Admin] Deleting season using service layer`);
      await seasonService.deleteSeason(seasonId);

      logger.info(`[Admin] Season ${season.season || season.year} deleted successfully`);
      res.json({
        message: `Season ${season.season || season.year} deleted successfully`,
      });
    } catch (error) {
      logger.error("[Admin] Delete season error:", error);
      logger.error("[Admin] Error stack:", error.stack);
      
      // Handle specific service errors
      if (error.message === 'Season not found') {
        return res.status(404).json({ error: error.message });
      } else if (error.message.includes('Cannot delete season that has associated games')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({
        error: "Internal server error",
        details: error.message
      });
    }
  }
);

// Toggle season status
router.put(
  "/seasons/:seasonId/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;
      const { isActive } = req.body;

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await seasonService.updateSeasonStatus(seasonId, isActive);

      res.json({ message: "Season status updated successfully" });
    } catch (error) {
      logger.error("Update season status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Sync NFL games for season
router.post(
  "/seasons/:seasonId/sync-football-games",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      
      const season = await seasonService.getSeasonById(seasonId);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      // This would integrate with ESPN API to sync games
      // For now, return success with count
      const gameCount = await nflDataService.getGameCountBySeason(seasonId);

      res.json({
        message: "NFL games synced successfully",
        gamesCount: gameCount.count,
      });
    } catch (error) {
      logger.error("Sync NFL games error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Sync NFL games for season (proper ESPN integration)
router.post(
  "/seasons/:seasonId/sync-nfl-games",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      // Call ESPN service to actually sync games
      const result = await espnService.updateNFLGames(seasonId);

      res.json({
        message: `ESPN sync completed for ${season.season}`,
        gamesCount: result.created + result.updated,
        created: result.created,
        updated: result.updated
      });
    } catch (error) {
      logger.error("Sync NFL games error:", error);
      res.status(500).json({ error: error.message || "Failed to sync NFL games" });
    }
  }
);

// Toggle game status
router.put(
  "/games/:gameId/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { gameId } = req.params;
      const { isActive } = req.body;

      const gameService = DatabaseServiceFactory.getGameService();
      const game = await gameService.getGameByIdForAdmin(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      await gameService.updateGameStatus(gameId, isActive);

      res.json({ message: "Game status updated successfully" });
    } catch (error) {
      logger.error("Update game status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update NFL game time
router.put(
  "/football-games/:gameId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { gameId } = req.params;
      const { start_time } = req.body;

      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      const game = await nflDataService.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      await nflDataService.updateGameTime(gameId, start_time);

      res.json({ message: "Game time updated successfully" });
    } catch (error) {
      logger.error("Update game time error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Set current season
router.put(
  "/seasons/:seasonId/current",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
      
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await seasonService.setCurrentSeason(seasonId);

      res.json({ message: "Current season updated successfully" });
    } catch (error) {
      logger.error("Set current season error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Unset current season
router.put(
  "/seasons/:seasonId/unset-current",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId } = req.params;

      const seasonService = DatabaseServiceFactory.getSeasonService();
      const season = await seasonService.getSeasonById(seasonId);
      
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await seasonService.unsetCurrentSeason(seasonId);

      res.json({ message: "Season unset as current successfully" });
    } catch (error) {
      logger.error("Unset current season error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update team information
router.put(
  "/teams/:teamId",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const {
        team_city,
        team_name,
        team_primary_color,
        team_secondary_color,
        team_logo,
      } = req.body;

      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      const team = await nflDataService.getTeamById(teamId);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      await nflDataService.updateTeam(teamId, {
        team_city,
        team_name,
        team_primary_color,
        team_secondary_color,
        team_logo
      });

      res.json({ message: "Team updated successfully" });
    } catch (error) {
      logger.error("Update team error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Scheduler management endpoints

// Get scheduler status
router.get(
  "/scheduler/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const status = scheduler.getStatus();
      res.json({ status });
    } catch (error) {
      logger.error("Get scheduler status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Start scheduler
router.post(
  "/scheduler/start",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      scheduler.start();
      const status = scheduler.getStatus();
      res.json({
        message: "Scheduler started successfully",
        status,
      });
    } catch (error) {
      logger.error("Start scheduler error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Stop scheduler
router.post(
  "/scheduler/stop",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      scheduler.stop();
      const status = scheduler.getStatus();
      res.json({
        message: "Scheduler stopped successfully",
        status,
      });
    } catch (error) {
      logger.error("Stop scheduler error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Trigger manual update
router.post(
  "/scheduler/trigger",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      await scheduler.triggerUpdate();
      res.json({ message: "Manual update triggered successfully" });
    } catch (error) {
      logger.error("Trigger manual update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update the existing calculate-picks endpoint to use the new service
router.post(
  "/calculate-picks",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { seasonId, week } = req.body;

      if (!seasonId) {
        return res.status(400).json({ error: "Season ID is required" });
      }

      const result = await pickCalculator.calculatePicks(seasonId, week);

      res.json({
        message: `Updated ${result.updatedPicks} picks for ${result.completedGames} completed games`,
        gamesProcessed: result.completedGames,
        picksUpdated: result.updatedPicks,
        week: result.week,
      });
    } catch (error) {
      logger.error("Calculate picks error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// On-demand score update endpoint
router.post("/update-scores-on-demand", authenticateToken, async (req, res) => {
  try {
    const { seasonId, week } = req.body;

    if (seasonId && week) {
      // Update specific week
      const result = await onDemandUpdates.updateScoresIfStale(seasonId, week);
      res.json(result);
    } else {
      // Update current week
      const result = await onDemandUpdates.updateCurrentWeekIfStale();
      res.json(result);
    }
  } catch (error) {
    logger.error("On-demand update error:", error);
    res.status(500).json({
      updated: false,
      reason: "Server error",
      error: error.message,
    });
  }
});

// Update game season
router.put(
  "/games/:gameId/season",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { gameId } = req.params;
      const { seasonId } = req.body;

      if (!seasonId) {
        return res.status(400).json({ error: "Season ID is required" });
      }

      const gameService = DatabaseServiceFactory.getGameService();
      const seasonService = DatabaseServiceFactory.getSeasonService();
      
      const game = await gameService.getGameByIdForAdmin(gameId);
      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const season = await seasonService.getSeasonById(seasonId);
      if (!season) {
        return res.status(404).json({ error: "Season not found" });
      }

      await gameService.updateGameSeason(gameId, seasonId);

      res.json({ message: "Game season updated successfully" });
    } catch (error) {
      logger.error("Update game season error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get last update time for a week
router.get(
  "/scores-last-updated/:seasonId/:week",
  authenticateToken,
  async (req, res) => {
    try {
      const { seasonId, week } = req.params;
      const lastUpdate = await onDemandUpdates.getLastUpdateTime(
        seasonId,
        week
      );
      const formatted = onDemandUpdates.formatLastUpdate(lastUpdate);

      res.json({
        lastUpdate,
        formatted,
        isStale: await onDemandUpdates.areScoresStale(seasonId, week),
      });
    } catch (error) {
      logger.error("Get last update error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Settings management endpoints

// Get encryption key from config service
const getEncryptionKey = () => configService.getSettingsEncryptionKey();

function encrypt(text) {
  // Generate a random initialization vector
  const iv = crypto.randomBytes(16);
  
  // Create a 32-byte key from the encryption key
  const key = crypto.scryptSync(getEncryptionKey(), 'salt', 32);
  
  // Create cipher with key and IV
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  // Prepend IV to encrypted data (IV is not secret)
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText) {
  try {
    // Validate input
    if (!encryptedText || typeof encryptedText !== 'string') {
      logger.warn("Invalid encrypted text provided to decrypt function");
      return "";
    }

    // Check if this is the new format (contains ":")
    if (encryptedText.includes(":")) {
      // New format: IV:encrypted
      const parts = encryptedText.split(":");
      if (parts.length !== 2) {
        throw new Error("Invalid encrypted format");
      }
      
      const ivHex = parts[0];
      const encrypted = parts[1];
      
      // Validate hex strings
      if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(encrypted)) {
        throw new Error("Invalid hex format in encrypted data");
      }
      
      // Validate IV length (should be 32 hex chars = 16 bytes)
      if (ivHex.length !== 32) {
        throw new Error("Invalid IV length");
      }
      
      const iv = Buffer.from(ivHex, "hex");
      
      // Create a 32-byte key from the encryption key
      const key = crypto.scryptSync(getEncryptionKey(), 'salt', 32);
      
      // Create decipher with key and IV
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      
      return decrypted;
    } else {
      // Legacy format: try multiple decryption methods
      logger.warn("Attempting to decrypt legacy encrypted value. Consider re-saving to use new encryption.");
      
      // Try method 1: Zero IV (most common legacy method)
      try {
        const key = crypto.scryptSync(getEncryptionKey(), 'salt', 32);
        const iv = Buffer.alloc(16, 0);
        
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        
        return decrypted;
      } catch (method1Error) {
        logger.warn("Legacy decryption method 1 failed:", method1Error.message);
      }
      
      // Try method 2: Different key derivation (if the original used a different method)
      try {
        const key = Buffer.from(getEncryptionKey().padEnd(32, '0').slice(0, 32), 'utf8');
        const iv = Buffer.alloc(16, 0);
        
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        
        return decrypted;
      } catch (method2Error) {
        logger.warn("Legacy decryption method 2 failed:", method2Error.message);
      }
      
      // Try method 3: MD5 hash of key (another common legacy method)
      try {
        let key = crypto.createHash('md5').update(ENCRYPTION_KEY).digest();
        key = Buffer.concat([key, key]); // Extend to 32 bytes
        const iv = Buffer.alloc(16, 0);
        
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        
        return decrypted;
      } catch (method3Error) {
        logger.warn("Legacy decryption method 3 failed:", method3Error.message);
      }
      
      // Try method 4: SHA256 hash of key
      try {
        let key = crypto.createHash('sha256').update(getEncryptionKey()).digest();
        const iv = Buffer.alloc(16, 0);
        
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        
        return decrypted;
      } catch (method4Error) {
        logger.warn("Legacy decryption method 4 failed:", method4Error.message);
      }
      
      // Try method 5: AES-128 instead of AES-256 (in case original was 128)
      try {
        const key = crypto.scryptSync(getEncryptionKey(), 'salt', 16); // 16 bytes for AES-128
        const iv = Buffer.alloc(16, 0);
        
        const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        
        return decrypted;
      } catch (method5Error) {
        logger.warn("Legacy decryption method 5 failed:", method5Error.message);
      }

      logger.error("All legacy decryption methods failed for value");
      return "";
    }
  } catch (error) {
    logger.error("Decryption error:", error);
    logger.debug("Failed to decrypt value:", error.message);
    logger.debug("Encrypted text length:", encryptedText?.length || 0);
    logger.debug("Encryption key defined:", !!getEncryptionKey());
    
    // Return empty string so the UI doesn't break
    return "";
  }
}

// Get all settings by category
router.get(
  "/settings/:category",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { category } = req.params;

      let settings;
      if (db.getType && db.getType() === 'dynamodb') {
        // DynamoDB implementation - scan with filter
        const result = await db.provider._dynamoScan('system_settings', { category });
        settings = (result.Items || []).sort((a, b) => a.key.localeCompare(b.key));
      } else {
        // SQLite implementation
        settings = await db.all(
          `
        SELECT key, value, encrypted, description
        FROM system_settings
        WHERE category = ?
        ORDER BY key
      `,
          [category]
        );
      }

      // Decrypt encrypted values for display (but mask passwords)
      const processedSettings = settings.map((setting) => {
        let displayValue = setting.value;
        
        if (setting.encrypted) {
          if (setting.key.toLowerCase().includes("pass")) {
            displayValue = "••••••••"; // Mask passwords
          } else {
            try {
              displayValue = decrypt(setting.value);
            } catch (error) {
              logger.warn(`Failed to decrypt setting ${setting.key}:`, error.message);
              displayValue = ""; // Show empty value for failed decryption
            }
          }
        }
        
        return {
          ...setting,
          value: displayValue,
        };
      });

      res.json({ settings: processedSettings });
    } catch (error) {
      logger.error("Get settings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Update settings
router.put(
  "/settings/:category",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { category } = req.params;
      const { settings } = req.body;

      if (!Array.isArray(settings)) {
        return res.status(400).json({ error: "Settings must be an array" });
      }

      for (const setting of settings) {
        const { key, value, encrypted = false, description = "" } = setting;

        if (!key) continue;

        const settingId = `${category}_${key}`;
        const processedValue = encrypted ? encrypt(value) : value;

        if (db.getType && db.getType() === 'dynamodb') {
          // DynamoDB implementation
          await db.provider._dynamoPut('system_settings', {
            id: settingId,
            category,
            key,
            value: processedValue,
            encrypted: encrypted ? true : false,
            description,
            updated_at: new Date().toISOString()
          });
        } else {
          // SQLite implementation
          await db.run(
            `
          INSERT OR REPLACE INTO system_settings (id, category, key, value, encrypted, description, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `,
            [
              settingId,
              category,
              key,
              processedValue,
              encrypted ? 1 : 0,
              description,
            ]
          );
        }
      }

      // Refresh email service transporter if SMTP settings were updated
      if (category === "smtp") {
        await emailService.refreshTransporter();
      }

      res.json({ message: "Settings updated successfully" });
    } catch (error) {
      logger.error("Update settings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Clear corrupted encrypted settings
router.delete(
  "/settings/:category/clear-encrypted",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { category } = req.params;

      if (db.getType && db.getType() === 'dynamodb') {
        // DynamoDB implementation - scan for encrypted settings in category
        const result = await db.provider._dynamoScan('system_settings', { category });
        const encryptedSettings = (result.Items || []).filter(setting => setting.encrypted);
        
        for (const setting of encryptedSettings) {
          await db.provider._dynamoDelete('system_settings', { id: setting.id });
        }
        
        res.json({
          message: `Cleared ${encryptedSettings.length} corrupted encrypted settings from ${category}`,
          cleared: encryptedSettings.map(s => s.key)
        });
      } else {
        // SQLite implementation
        const encryptedSettings = await db.all(
          "SELECT id, key FROM system_settings WHERE category = ? AND encrypted = 1",
          [category]
        );
        
        if (encryptedSettings.length > 0) {
          await db.run(
            "DELETE FROM system_settings WHERE category = ? AND encrypted = 1",
            [category]
          );
        }
        
        res.json({
          message: `Cleared ${encryptedSettings.length} corrupted encrypted settings from ${category}`,
          cleared: encryptedSettings.map(s => s.key)
        });
      }
    } catch (error) {
      logger.error("Clear encrypted settings error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Test SMTP connection
router.post(
  "/settings/smtp/test",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      let { host, port, user, pass, from } = req.body;

      if (!host || !user || !pass || !from) {
        return res
          .status(400)
          .json({ error: "All SMTP fields are required for testing" });
      }

      // If password is masked, retrieve the real password from database
      if (pass === "••••••••") {
        try {
          let passwordSetting = null;
          
          if (db.getType && db.getType() === 'dynamodb') {
            // DynamoDB implementation - get specific password setting
            try {
              const result = await db.provider._dynamoGet('system_settings', {
                id: 'smtp_pass'
              });
              if (result && result.Item) {
                passwordSetting = result.Item;
              } else {
                // Try alternative password key
                const altResult = await db.provider._dynamoGet('system_settings', {
                  id: 'smtp_password'
                });
                if (altResult && altResult.Item) {
                  passwordSetting = altResult.Item;
                }
              }
            } catch (error) {
              logger.error("Error retrieving password from DynamoDB:", error);
              throw error;
            }
          } else {
            // SQLite implementation - get specific password setting
            try {
              passwordSetting = await db.get(
                "SELECT key, value, encrypted FROM system_settings WHERE category = 'smtp' AND (key = 'pass' OR key = 'password') LIMIT 1",
                []
              );
            } catch (error) {
              logger.error("Error retrieving password from SQLite:", error);
              throw error;
            }
          }
          
          if (passwordSetting && passwordSetting.encrypted) {
            const decryptedPass = decrypt(passwordSetting.value);
            // If decryption returns empty string, it failed
            if (!decryptedPass || decryptedPass === "") {
              throw new Error("Decryption returned empty result");
            }
            pass = decryptedPass;
            logger.debug("Successfully retrieved and decrypted stored SMTP password");
          } else {
            throw new Error("No stored encrypted password found");
          }
        } catch (error) {
          logger.warn("Failed to retrieve/decrypt stored SMTP password:", error.message);
          return res.status(400).json({
            error: "Cannot use stored password due to encryption issues. Please enter your actual SMTP password in the password field instead of using the masked (••••••••) value. After testing successfully, you can save your settings again to fix the encryption.",
            suggestion: "Clear the password field and enter your real SMTP password to test."
          });
        }
      }

      const { default: nodemailer } = await import("nodemailer");
      const testTransporter = nodemailer.createTransport({
        host: host,
        port: parseInt(port) || 587,
        secure: false,
        auth: {
          user: user,
          pass: pass,
        },
      });

      // Verify connection
      await testTransporter.verify();

      // Send test email
      await testTransporter.sendMail({
        from: from,
        to: req.user.email, // Send test email to admin
        subject: "SMTP Test - NFL Pick'em",
        text: "This is a test email to verify your SMTP settings are working correctly.",
        html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>🏈 SMTP Test Successful!</h2>
          <p>Your SMTP settings are working correctly.</p>
          <p>This test email was sent from your NFL Pick'em application.</p>
        </div>
      `,
      });

      res.json({
        success: true,
        message: "SMTP test successful! Check your email for the test message.",
      });
    } catch (error) {
      logger.error("SMTP test error:", error);
      res.status(400).json({
        success: false,
        error: `SMTP test failed: ${error.message}`,
      });
    }
  }
);

// Invite user to game (admin only)
router.post("/invite-user", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email, gameId } = req.body;

    if (!email || !gameId) {
      return res.status(400).json({ error: "Email and game ID are required" });
    }

    const normalizedEmail = email.toLowerCase();

    // Get game information
    const gameService = DatabaseServiceFactory.getGameService();
    const game = await gameService.getGameByIdForAdmin(gameId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Get admin user information for invitation
    const userService = DatabaseServiceFactory.getUserService();
    const inviter = await userService.getUserBasicInfo(req.user.id);

    // Check if user already exists
    const existingUser = await userService.getUserByEmail(normalizedEmail);

    if (existingUser) {
      // User exists - add them directly to the game

      // Check if user is already in the game
      let existingParticipant;
      if (db.getType() === 'dynamodb') {
        // For DynamoDB, get all participants using scan
        const participantsResult = await db.provider._dynamoScan('game_participants', { game_id: gameId });
        const allParticipants = participantsResult.Items || [];
        existingParticipant = allParticipants.find(p => p.user_id === existingUser.id);
      } else {
        // For SQLite, use the efficient query
        const participantService = DatabaseServiceFactory.getGameService();
        existingParticipant = await participantService.checkGameParticipant(gameId, existingUser.id);
      }

      if (existingParticipant) {
        return res
          .status(409)
          .json({ error: "User is already in this game" });
      }

      // Add user as player
      const { v4: uuidv4 } = await import("uuid");
      await gameService.addParticipant(gameId, existingUser.id, 'player');

      res.json({
        message: `Successfully added ${existingUser.email} to the game "${game.game_name}"`,
        type: "direct_add",
        player: {
          id: existingUser.id,
          email: existingUser.email,
        },
      });
    } else {
      // User doesn't exist - send invitation

      // Check if invitation already exists and create new one using service
      const invitationService = DatabaseServiceFactory.getInvitationService();
      const existingInvitation = await invitationService.checkExistingInvitation(gameId, normalizedEmail);

      if (existingInvitation) {
        return res
          .status(409)
          .json({ error: "Invitation already sent to this email for this game" });
      }

      // Create invitation
      const crypto = await import("crypto");
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
        logger.error("Failed to send invitation email:", emailResult.error);
        // Still return success since the invitation was saved to database
      }

      res.json({
        message: `Invitation sent to ${normalizedEmail} for game "${game.game_name}". They'll receive an email to join the game.`,
        type: "invitation_sent",
        email: normalizedEmail,
      });
    }
  } catch (error) {
    logger.error("Admin invite user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Invite admin user (admin only)
router.post("/invite-admin", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase();

    // Get admin user information for invitation
    const userService = DatabaseServiceFactory.getUserService();
    const inviter = await userService.getUserBasicInfo(req.user.id);

    // Check if user already exists
    const existingUser = await userService.getUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ error: "User with this email already exists" });
    }

    // Check if admin invitation already exists
    const invitationService = DatabaseServiceFactory.getInvitationService();
    const existingInvitation = await invitationService.checkExistingAdminInvitation(normalizedEmail);
    if (existingInvitation) {
      return res.status(409).json({
        error: "Admin invitation already sent to this email"
      });
    }

    // Create admin invitation
    const crypto = await import("crypto");
    const { v4: uuidv4 } = await import("uuid");
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    const invitation = await invitationService.createAdminInvitation({
      email: normalizedEmail,
      invitedByUserId: req.user.id,
      inviteToken,
      expiresAt: expiresAt.toISOString()
    });

    // Send invitation email
    let emailResult = { success: false, error: 'Email service not attempted' };
    try {
      logger.debug(`[Admin] Attempting to send admin invitation email to: ${normalizedEmail}`);
      emailResult = await emailService.sendAdminInvitation(
        normalizedEmail,
        `${inviter.first_name} ${inviter.last_name}`,
        inviteToken
      );
      logger.debug(`[Admin] Email service result:`, emailResult);
    } catch (emailError) {
      logger.error("Error calling email service for admin invitation:", emailError);
      emailResult = { success: false, error: emailError.message };
    }

    if (!emailResult.success) {
      logger.error("Failed to send admin invitation email:", emailResult.error);
      // Still return success since the invitation was saved to database
      logger.debug("Proceeding with success response despite email failure");
    }

    logger.debug(`[Admin] Sending success response for admin invitation`);
    res.json({
      message: `Admin invitation sent to ${normalizedEmail}. They'll receive an email to create their admin account.`,
      type: "admin_invitation_sent",
      email: normalizedEmail,
      emailSent: emailResult.success
    });
  } catch (error) {
    logger.error("Admin invite user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Send password reset email for a user (admin only)
router.post("/users/:userId/reset-password", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user info
    const userService = DatabaseServiceFactory.getUserService();
    const user = await userService.getUserBasicInfo(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate reset token
    const { v4: uuidv4 } = await import("uuid");
    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour from now

    await userService.setPasswordResetToken(userId, resetToken, resetExpires);

    // Send reset email
    const emailResult = await emailService.sendPasswordReset(
      user.email,
      `${user.first_name} ${user.last_name}`,
      resetToken
    );

    if (!emailResult.success) {
      logger.error("Failed to send password reset email:", emailResult.error);
      return res.status(500).json({
        error: "Failed to send password reset email. Please check email configuration."
      });
    }

    res.json({
      message: `Password reset email sent to ${user.email}`,
      email: user.email,
    });
  } catch (error) {
    logger.error("Admin password reset error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get default team colors from special DEFAULT team record
router.get("/default-colors", authenticateToken, requireAdmin, async (req, res) => {
  try {
    let defaultTeam;
    
    if (db.getType && db.getType() === 'dynamodb') {
      // DynamoDB implementation
      const result = await db.provider._dynamoScan('football_teams', { team_code: 'DEFAULT' });
      defaultTeam = result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } else {
      // SQLite implementation
      defaultTeam = await db.get("SELECT * FROM football_teams WHERE team_code = 'DEFAULT'");
    }
    
    if (!defaultTeam) {
      // Create default team record if it doesn't exist
      const { v4: uuidv4 } = await import("uuid");
      const defaultTeamId = uuidv4();
      const defaultColors = {
        id: defaultTeamId,
        team_code: 'DEFAULT',
        team_name: 'NFL Default',
        team_city: 'League',
        team_conference: 'SYSTEM',
        team_division: 'DEFAULT',
        team_primary_color: '#013369',
        team_secondary_color: '#d50a0a',
        team_logo: '/logos/NFL.svg'
      };
      
      if (db.getType && db.getType() === 'dynamodb') {
        await db.provider._dynamoPut('football_teams', {
          ...defaultColors,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else {
        await db.run(`
          INSERT INTO football_teams (
            id, team_code, team_name, team_city, team_conference, team_division,
            team_primary_color, team_secondary_color, team_logo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          defaultTeamId, 'DEFAULT', 'Default Colors', 'System', 'SYSTEM', 'DEFAULT',
          '#013369', '#d50a0a', '/logos/NFL.svg'
        ]);
      }
      
      defaultTeam = defaultColors;
    }
    
    res.json({
      defaultPrimaryColor: defaultTeam.team_primary_color || '#013369',
      defaultSecondaryColor: defaultTeam.team_secondary_color || '#d50a0a'
    });
  } catch (error) {
    logger.error("Get default colors error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Set default team colors by updating the special DEFAULT team record
router.put("/default-colors", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { defaultPrimaryColor, defaultSecondaryColor } = req.body;
    
    if (!defaultPrimaryColor || !defaultSecondaryColor) {
      return res.status(400).json({ error: "Both primary and secondary colors are required" });
    }
    
    // Find the default team record
    let defaultTeam;
    if (db.getType && db.getType() === 'dynamodb') {
      const result = await db.provider._dynamoScan('football_teams', { team_code: 'DEFAULT' });
      defaultTeam = result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } else {
      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      defaultTeam = await nflDataService.getTeamByCode('DEFAULT');
    }
    
    if (!defaultTeam) {
      return res.status(404).json({ error: "Default team record not found" });
    }
    
    // Update the default team colors
    if (db.getType && db.getType() === 'dynamodb') {
      await db.provider._dynamoUpdate('football_teams', { id: defaultTeam.id }, {
        team_primary_color: defaultPrimaryColor,
        team_secondary_color: defaultSecondaryColor,
        updated_at: new Date().toISOString()
      });
    } else {
      await db.run(`
        UPDATE football_teams
        SET team_primary_color = ?, team_secondary_color = ?, updated_at = datetime('now')
        WHERE team_code = 'DEFAULT'
      `, [defaultPrimaryColor, defaultSecondaryColor]);
    }
    
    res.json({
      message: "Default colors updated successfully",
      defaultPrimaryColor,
      defaultSecondaryColor
    });
  } catch (error) {
    logger.error("Set default colors error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get the DEFAULT team record for use when users have no favorite team
router.get("/default-team", authenticateToken, async (req, res) => {
  try {
    let defaultTeam;
    
    if (db.getType && db.getType() === 'dynamodb') {
      const result = await db.provider._dynamoScan('football_teams', { team_code: 'DEFAULT' });
      defaultTeam = result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } else {
      const nflDataService = DatabaseServiceFactory.getNFLDataService();
      defaultTeam = await nflDataService.getTeamByCode('DEFAULT');
    }
    
    if (!defaultTeam) {
      // Create default team record if it doesn't exist
      const { v4: uuidv4 } = await import("uuid");
      const defaultTeamId = uuidv4();
      const defaultColors = {
        id: defaultTeamId,
        team_code: 'DEFAULT',
        team_name: 'NFL Default',
        team_city: 'League',
        team_conference: 'SYSTEM',
        team_division: 'DEFAULT',
        team_primary_color: '#013369',
        team_secondary_color: '#d50a0a',
        team_logo: '/logos/NFL.svg'
      };
      
      if (db.getType && db.getType() === 'dynamodb') {
        await db.provider._dynamoPut('football_teams', {
          ...defaultColors,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else {
        await db.run(`
          INSERT INTO football_teams (
            id, team_code, team_name, team_city, team_conference, team_division,
            team_primary_color, team_secondary_color, team_logo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          defaultTeamId, 'DEFAULT', 'NFL Default', 'League', 'SYSTEM', 'DEFAULT',
          '#013369', '#d50a0a', '/logos/NFL.svg'
        ]);
      }
      
      defaultTeam = defaultColors;
    }
    
    res.json({ defaultTeam });
  } catch (error) {
    logger.error("Get default team error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
